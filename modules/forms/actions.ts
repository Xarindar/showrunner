"use server";

import { FormAttachmentTargetType, FormDestination, FormFieldRole, FormFieldType, FormStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { csvList, optionalEmail, optionalStoredText, parseForm, requiredText } from "@/lib/admin-validation";
import { requireAdmin } from "@/lib/auth";
import { queueFormSubmittedEmail } from "@/lib/email";
import { emitModuleEvent, requestAttribution } from "@/lib/events/emit";
import { prisma } from "@/lib/prisma";
import { publicRateLimitMessage } from "@/lib/public-rate-limit";
import { getCurrentSiteId, getSiteSettings } from "@/lib/site";
import { slugify } from "@/lib/slug";
import { findFormTemplate } from "./templates";

const supportedDestinations = Object.values(FormDestination) as [FormDestination, ...FormDestination[]];
const formAttachmentQueryKeyByType: Record<FormAttachmentTargetType, string> = {
  [FormAttachmentTargetType.BOOKING]: "booking",
  [FormAttachmentTargetType.ORDER]: "order",
  [FormAttachmentTargetType.GALLERY]: "gallery"
};
const hiddenHoneypotField = "companyWebsite";

const formSchema = z
  .object({
    name: requiredText,
    slug: optionalStoredText,
    description: optionalStoredText,
    status: z.enum(FormStatus).catch(FormStatus.DRAFT),
    destination: z.enum(supportedDestinations).catch(FormDestination.STANDALONE_LEAD),
    submitButtonLabel: optionalStoredText,
    successMessage: optionalStoredText,
    notificationEmail: optionalEmail
  })
  .transform((value) => ({
    ...value,
    submitButtonLabel: value.submitButtonLabel || "Submit",
    successMessage: value.successMessage || "Thanks. Your form was submitted."
  }));

const formUpdateSchema = formSchema.and(z.object({ id: requiredText }));

const formStatusSchema = z.object({
  id: requiredText,
  status: z.enum(FormStatus)
});

const deleteFormSchema = z.object({
  id: requiredText,
  confirmDelete: z.literal("on", { error: "Confirm deletion before removing the form." })
});

const duplicateFormSchema = z.object({
  id: requiredText
});

const templateFormSchema = z.object({
  templateKey: requiredText
});

const attachmentSchema = z.object({
  formId: requiredText,
  targetType: z.enum(FormAttachmentTargetType),
  targetId: requiredText,
  isRequired: z.literal("on").optional()
});

const attachmentDeleteSchema = z.object({
  id: requiredText,
  formId: requiredText
});

const fieldSchema = z
  .object({
    formId: requiredText,
    label: requiredText,
    type: z.enum(FormFieldType).catch(FormFieldType.TEXT),
    fieldRole: z.enum(FormFieldRole).catch(FormFieldRole.NONE),
    placeholder: optionalStoredText,
    helpText: optionalStoredText,
    options: optionalStoredText,
    isRequired: z.literal("on").optional(),
    isHidden: z.literal("on").optional(),
    sortOrder: z.coerce.number().int().default(0)
  })
  .transform((value) => ({
    ...value,
    fieldRole:
      value.fieldRole === FormFieldRole.SUBMITTER_EMAIL && value.type !== FormFieldType.EMAIL
        ? FormFieldRole.NONE
        : value.type === FormFieldType.EMAIL && value.fieldRole === FormFieldRole.SUBMITTER_NAME
          ? FormFieldRole.NONE
          : value.fieldRole,
    options: csvList(value.options),
    isRequired: value.isRequired === "on",
    isHidden: value.type === FormFieldType.HIDDEN || value.isHidden === "on"
  }));

const fieldUpdateSchema = fieldSchema.and(z.object({ id: requiredText }));

const fieldDeleteSchema = z.object({
  id: requiredText,
  formId: requiredText,
  confirmDelete: z.literal("on", { error: "Confirm deletion before removing the field." })
});

async function generateUniqueFormSlug(name: string, inputSlug: string | undefined, exceptId: string | undefined, siteId: string) {
  const base = slugify(inputSlug || name) || "form";
  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = await prisma.form.findFirst({
      where: { siteId, slug: candidate },
      select: { id: true }
    });

    if (!existing || existing.id === exceptId) return candidate;

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

function refreshForms(slug?: string) {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/modules/forms");
  revalidatePath("/admin/modules/appointments");
  revalidatePath("/admin/modules/products");
  revalidatePath("/admin/modules/portfolio");
  revalidatePath("/book");
  revalidatePath("/cart");
  revalidatePath("/galleries");
  if (slug) revalidatePath(`/forms/${slug}`);
}

function publicFormPath(
  slug: string,
  attachmentContext?: { targetId: string; targetType: FormAttachmentTargetType },
  query?: Record<string, string>
) {
  const params = new URLSearchParams();
  if (attachmentContext) params.set(formAttachmentQueryKeyByType[attachmentContext.targetType], attachmentContext.targetId);
  for (const [key, value] of Object.entries(query || {})) params.set(key, value);
  const serialized = params.toString();

  return `/forms/${slug}${serialized ? `?${serialized}` : ""}`;
}

export async function createFormAction(formData: FormData) {
  await requireAdmin("forms:manage");
  const input = await parseForm(formSchema, formData, "/admin/modules/forms");
  const siteId = await getCurrentSiteId();
  const slug = await generateUniqueFormSlug(input.name, input.slug, undefined, siteId);

  let form;
  try {
    form = await prisma.form.create({
      data: {
        siteId,
        slug,
        name: input.name,
        description: input.description,
        status: input.status,
        destination: input.destination,
        submitButtonLabel: input.submitButtonLabel,
        successMessage: input.successMessage,
        notificationEmail: input.notificationEmail
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`/admin/modules/forms?error=${encodeURIComponent("That form URL is already in use. Try another slug.")}`);
    }

    throw error;
  }

  refreshForms(form.slug);
  redirect(`/admin/modules/forms?saved=form&form=${form.id}`);
}

export async function updateFormAction(formData: FormData) {
  await requireAdmin("forms:manage");
  const input = await parseForm(formUpdateSchema, formData, "/admin/modules/forms");
  const siteId = await getCurrentSiteId();
  const current = await prisma.form.findFirst({
    where: { id: input.id, siteId },
    select: { slug: true }
  });

  if (!current) {
    redirect(`/admin/modules/forms?error=${encodeURIComponent("Form not found.")}`);
  }

  const slug = input.slug
    ? await generateUniqueFormSlug(input.name, input.slug, input.id, siteId)
    : current?.slug || (await generateUniqueFormSlug(input.name, undefined, input.id, siteId));

  try {
    await prisma.form.update({
      where: { id: input.id },
      data: {
        slug,
        name: input.name,
        description: input.description,
        status: input.status,
        destination: input.destination,
        submitButtonLabel: input.submitButtonLabel,
        successMessage: input.successMessage,
        notificationEmail: input.notificationEmail
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`/admin/modules/forms?form=${input.id}&error=${encodeURIComponent("That form URL is already in use. Try another slug.")}`);
    }

    throw error;
  }

  refreshForms(slug);
  redirect(`/admin/modules/forms?saved=form&form=${input.id}`);
}

export async function updateFormStatusAction(formData: FormData) {
  await requireAdmin("forms:manage");
  const input = await parseForm(formStatusSchema, formData, "/admin/modules/forms");
  const siteId = await getCurrentSiteId();

  const form = await prisma.form.findFirst({
    where: { id: input.id, siteId },
    select: { slug: true }
  });

  if (!form) {
    redirect(`/admin/modules/forms?error=${encodeURIComponent("Form not found.")}`);
  }

  await prisma.form.update({
    where: { id: input.id },
    data: { status: input.status }
  });

  refreshForms(form.slug);
}

export async function duplicateFormAction(formData: FormData) {
  await requireAdmin("forms:manage");
  const input = await parseForm(duplicateFormSchema, formData, "/admin/modules/forms");
  const siteId = await getCurrentSiteId();
  const source = await prisma.form.findFirst({
    where: { id: input.id, siteId },
    include: {
      fields: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  if (!source) {
    redirect(`/admin/modules/forms?error=${encodeURIComponent("Form not found.")}`);
  }

  const slug = await generateUniqueFormSlug(`${source.name} copy`, undefined, undefined, siteId);
  const form = await prisma.form.create({
    data: {
      siteId,
      slug,
      name: `${source.name} copy`,
      description: source.description,
      status: FormStatus.DRAFT,
      destination: supportedDestinations.includes(source.destination as (typeof supportedDestinations)[number])
        ? source.destination
        : FormDestination.STANDALONE_LEAD,
      submitButtonLabel: source.submitButtonLabel,
      successMessage: source.successMessage,
      notificationEmail: source.notificationEmail,
      fields: {
        create: source.fields.map((field) => ({
          label: field.label,
          type: field.type,
          fieldRole: field.fieldRole,
          placeholder: field.placeholder,
          helpText: field.helpText,
          options: (Array.isArray(field.options) ? field.options : []) as Prisma.InputJsonValue,
          isRequired: field.isRequired,
          isHidden: field.isHidden,
          sortOrder: field.sortOrder
        }))
      }
    }
  });

  refreshForms(form.slug);
  redirect(`/admin/modules/forms?saved=duplicate&form=${form.id}`);
}

export async function createFormFromTemplateAction(formData: FormData) {
  await requireAdmin("forms:manage");
  const input = await parseForm(templateFormSchema, formData, "/admin/modules/forms");
  const template = findFormTemplate(input.templateKey);

  if (!template) {
    redirect(`/admin/modules/forms?error=${encodeURIComponent("Form template not found.")}`);
  }

  const siteId = await getCurrentSiteId();
  const slug = await generateUniqueFormSlug(template.name, undefined, undefined, siteId);
  const form = await prisma.form.create({
    data: {
      siteId,
      slug,
      name: template.name,
      description: template.description,
      status: FormStatus.DRAFT,
      destination: template.destination,
      submitButtonLabel: template.submitButtonLabel,
      successMessage: template.successMessage,
      fields: {
        create: template.fields.map((field, index) => ({
          label: field.label,
          type: field.type,
          fieldRole: field.fieldRole || FormFieldRole.NONE,
          placeholder: field.placeholder || "",
          helpText: field.helpText || "",
          options: (field.options || []) as Prisma.InputJsonValue,
          isRequired: field.isRequired || false,
          isHidden: field.type === FormFieldType.HIDDEN || field.isHidden || false,
          sortOrder: (index + 1) * 10
        }))
      }
    }
  });

  refreshForms(form.slug);
  redirect(`/admin/modules/forms?saved=template&form=${form.id}`);
}

export async function deleteFormAction(formData: FormData) {
  await requireAdmin("forms:manage");
  const input = await parseForm(deleteFormSchema, formData, "/admin/modules/forms");
  const siteId = await getCurrentSiteId();

  const form = await prisma.form.findFirst({
    where: { id: input.id, siteId },
    select: { slug: true }
  });

  if (!form) {
    redirect(`/admin/modules/forms?error=${encodeURIComponent("Form not found.")}`);
  }

  await prisma.form.delete({
    where: { id: input.id }
  });

  refreshForms(form.slug);
  redirect("/admin/modules/forms?saved=delete");
}

export async function createFormFieldAction(formData: FormData) {
  await requireAdmin("forms:manage");
  const input = await parseForm(fieldSchema, formData, "/admin/modules/forms");
  const siteId = await getCurrentSiteId();
  const form = await prisma.form.findFirst({
    where: { id: input.formId, siteId },
    select: { slug: true }
  });

  if (!form) {
    redirect(`/admin/modules/forms?error=${encodeURIComponent("Form not found.")}`);
  }

  await prisma.formField.create({
    data: {
      formId: input.formId,
      label: input.label,
      type: input.type,
      fieldRole: input.fieldRole,
      placeholder: input.placeholder,
      helpText: input.helpText,
      options: input.options,
      isRequired: input.isRequired,
      isHidden: input.isHidden,
      sortOrder: input.sortOrder
    }
  });

  refreshForms(form.slug);
  redirect(`/admin/modules/forms?saved=field&form=${input.formId}`);
}

export async function updateFormFieldAction(formData: FormData) {
  await requireAdmin("forms:manage");
  const input = await parseForm(fieldUpdateSchema, formData, "/admin/modules/forms");
  const siteId = await getCurrentSiteId();
  const form = await prisma.form.findFirst({
    where: { id: input.formId, siteId },
    select: { slug: true }
  });

  if (!form) {
    redirect(`/admin/modules/forms?error=${encodeURIComponent("Form not found.")}`);
  }

  await prisma.formField.updateMany({
    where: { id: input.id, formId: input.formId, form: { siteId } },
    data: {
      label: input.label,
      type: input.type,
      fieldRole: input.fieldRole,
      placeholder: input.placeholder,
      helpText: input.helpText,
      options: input.options,
      isRequired: input.isRequired,
      isHidden: input.isHidden,
      sortOrder: input.sortOrder
    }
  });

  refreshForms(form.slug);
  redirect(`/admin/modules/forms?saved=field&form=${input.formId}`);
}

export async function deleteFormFieldAction(formData: FormData) {
  await requireAdmin("forms:manage");
  const input = await parseForm(fieldDeleteSchema, formData, "/admin/modules/forms");
  const siteId = await getCurrentSiteId();
  const form = await prisma.form.findFirst({
    where: { id: input.formId, siteId },
    select: { slug: true }
  });

  if (!form) {
    redirect(`/admin/modules/forms?error=${encodeURIComponent("Form not found.")}`);
  }

  await prisma.formField.deleteMany({
    where: { id: input.id, formId: input.formId, form: { siteId } }
  });

  refreshForms(form.slug);
  redirect(`/admin/modules/forms?saved=field-delete&form=${input.formId}`);
}

async function assertAttachmentTargetExists(targetType: FormAttachmentTargetType, targetId: string, siteId: string) {
  if (targetType === FormAttachmentTargetType.BOOKING) {
    return prisma.booking.findFirst({ where: { id: targetId, siteId }, select: { id: true } });
  }

  if (targetType === FormAttachmentTargetType.ORDER) {
    return prisma.order.findFirst({ where: { id: targetId, siteId }, select: { id: true } });
  }

  return prisma.portfolioGallery.findFirst({ where: { id: targetId, siteId }, select: { id: true } });
}

export async function createFormAttachmentAction(formData: FormData) {
  await requireAdmin("forms:manage");
  const input = await parseForm(attachmentSchema, formData, "/admin/modules/forms");
  const siteId = await getCurrentSiteId();
  const form = await prisma.form.findFirst({
    where: { id: input.formId, siteId },
    select: { id: true, slug: true }
  });

  if (!form) {
    redirect(`/admin/modules/forms?error=${encodeURIComponent("Form not found.")}`);
  }

  const target = await assertAttachmentTargetExists(input.targetType, input.targetId, siteId);
  if (!target) {
    redirect(`/admin/modules/forms?form=${input.formId}&error=${encodeURIComponent("Attachment target not found.")}`);
  }

  try {
    await prisma.formAttachment.create({
      data: {
        formId: input.formId,
        isRequired: input.isRequired === "on",
        siteId,
        targetId: input.targetId,
        targetType: input.targetType
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`/admin/modules/forms?form=${input.formId}&error=${encodeURIComponent("That form is already attached to the selected record.")}`);
    }

    throw error;
  }

  refreshForms(form.slug);
  redirect(`/admin/modules/forms?saved=attachment&form=${input.formId}`);
}

export async function deleteFormAttachmentAction(formData: FormData) {
  await requireAdmin("forms:manage");
  const input = await parseForm(attachmentDeleteSchema, formData, "/admin/modules/forms");
  const siteId = await getCurrentSiteId();
  const attachment = await prisma.formAttachment.findFirst({
    where: { id: input.id, formId: input.formId, siteId },
    include: { form: { select: { slug: true } } }
  });

  if (!attachment) {
    redirect(`/admin/modules/forms?form=${input.formId}&error=${encodeURIComponent("Attachment not found.")}`);
  }

  await prisma.formAttachment.delete({ where: { id: input.id } });

  refreshForms(attachment.form.slug);
  redirect(`/admin/modules/forms?saved=attachment-delete&form=${input.formId}`);
}

function publicFieldName(fieldId: string) {
  return `field-${fieldId}`;
}

function redirectWithPublicError(
  slug: string,
  message: string,
  attachmentContext?: { targetId: string; targetType: FormAttachmentTargetType }
): never {
  redirect(publicFormPath(slug, attachmentContext, { error: message }));
}

export async function createPublicFormSubmissionAction(formData: FormData) {
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("forms")) {
    redirect("/");
  }

  const formId = String(formData.get("formId") || "");
  const form = await prisma.form.findFirst({
    where: {
      siteId: settings.siteId,
      id: formId,
      status: FormStatus.ACTIVE
    },
    include: {
      fields: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  if (!form) redirect("/");

  const attachmentTargetType = String(formData.get("attachmentTargetType") || "");
  const attachmentTargetId = String(formData.get("attachmentTargetId") || "").trim();
  const hasAttachmentContext = Boolean(attachmentTargetType || attachmentTargetId);
  const parsedAttachmentType = z.enum(FormAttachmentTargetType).safeParse(attachmentTargetType);
  const attachmentContext =
    hasAttachmentContext && parsedAttachmentType.success && attachmentTargetId
      ? { targetId: attachmentTargetId, targetType: parsedAttachmentType.data }
      : undefined;

  if (hasAttachmentContext && !attachmentContext) {
    redirectWithPublicError(form.slug, "This form link is missing its attachment context.");
  }

  const formAttachment = attachmentContext
    ? await prisma.formAttachment.findFirst({
        where: {
          formId: form.id,
          siteId: settings.siteId,
          targetId: attachmentContext.targetId,
          targetType: attachmentContext.targetType
        },
        select: { id: true, isRequired: true, targetId: true, targetType: true }
      })
    : null;

  if (attachmentContext && !formAttachment) {
    redirectWithPublicError(form.slug, "This form is not attached to that record.", attachmentContext);
  }

  if (String(formData.get(hiddenHoneypotField) || "").trim()) {
    redirect(publicFormPath(form.slug, attachmentContext, { submitted: "1" }));
  }

  const rateLimitMessage = await publicRateLimitMessage("form_submission");
  if (rateLimitMessage) {
    redirectWithPublicError(form.slug, rateLimitMessage, attachmentContext);
  }

  const data: Record<string, { label: string; type: FormFieldType; value: string }> = {};
  let submitterName = "";
  let submitterEmail = "";

  for (const field of form.fields) {
    const key = publicFieldName(field.id);
    const rawValue = field.type === FormFieldType.CHECKBOX ? (formData.get(key) === "on" ? "yes" : "") : String(formData.get(key) || "").trim();
    const value = field.type === FormFieldType.HIDDEN ? field.placeholder : rawValue;

    if (field.isRequired && !value) {
      redirectWithPublicError(form.slug, `Complete ${field.label}.`, attachmentContext);
    }

    if (field.type === FormFieldType.EMAIL && value && !z.email().safeParse(value).success) {
      redirectWithPublicError(form.slug, "Use a valid email address.", attachmentContext);
    }

    data[field.id] = {
      label: field.label,
      type: field.type,
      value
    };

    if (!submitterName && field.fieldRole === FormFieldRole.SUBMITTER_NAME && value) submitterName = value;
    if (
      !submitterEmail &&
      (field.fieldRole === FormFieldRole.SUBMITTER_EMAIL || field.type === FormFieldType.EMAIL) &&
      value
    ) {
      submitterEmail = value.toLowerCase();
    }
  }

  let clientId: string | undefined;
  if ((form.destination === FormDestination.CLIENT || form.destination === FormDestination.INQUIRY) && submitterEmail) {
    const existingClient = await prisma.client.findUnique({
      where: { siteId_email: { siteId: settings.siteId, email: submitterEmail } },
      select: { id: true }
    });

    const client = existingClient
      ? existingClient
      : await prisma.client.create({
          data: {
            siteId: settings.siteId,
            name: submitterName || submitterEmail,
            email: submitterEmail,
            status: "lead"
          }
        });
    clientId = client.id;
  }

  const headerStore = await headers();
  const attachmentMetadata = formAttachment
    ? {
        attachmentTargetId: formAttachment.targetId,
        attachmentTargetType: formAttachment.targetType,
        formAttachmentId: formAttachment.id,
        isRequiredAttachment: formAttachment.isRequired
      }
    : {};

  const submission = await prisma.formSubmission.create({
    data: {
      formId: form.id,
      formAttachmentId: formAttachment?.id,
      clientId,
      submitterName,
      submitterEmail,
      data,
      metadata: {
        ...attachmentMetadata,
        destination: form.destination,
        userAgent: headerStore.get("user-agent") || ""
      }
    }
  });

  await queueFormSubmittedEmail(
    { id: form.id, name: form.name, notificationEmail: form.notificationEmail },
    {
      id: submission.id,
      submitterName,
      submitterEmail,
      data
    }
  );

  await emitModuleEvent("form.submitted", {
    ...(await requestAttribution(undefined, `/forms/${form.slug}`)),
    actorEmail: submitterEmail,
    metadata: {
      ...attachmentMetadata,
      clientId,
      destination: form.destination,
      formId: form.id,
      formName: form.name,
      formSlug: form.slug
    },
    relatedId: submission.id,
    relatedType: "form_submission"
  });

  refreshForms(form.slug);
  if (clientId) revalidatePath("/admin/modules/clients");
  redirect(publicFormPath(form.slug, attachmentContext, { submitted: "1" }));
}
