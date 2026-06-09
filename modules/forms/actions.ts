"use server";

import { FormDestination, FormFieldRole, FormFieldType, FormStatus, Prisma } from "@prisma/client";
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
import { getSiteSettings } from "@/lib/site";
import { slugify } from "@/lib/slug";

const supportedDestinations = [FormDestination.STANDALONE_LEAD, FormDestination.CLIENT, FormDestination.INQUIRY] as const;
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

async function generateUniqueFormSlug(name: string, inputSlug?: string, exceptId?: string) {
  const base = slugify(inputSlug || name) || "form";
  let candidate = base;
  let suffix = 2;

  while (true) {
    const existing = await prisma.form.findUnique({
      where: { slug: candidate },
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
  if (slug) revalidatePath(`/forms/${slug}`);
}

export async function createFormAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(formSchema, formData, "/admin/modules/forms");
  const slug = await generateUniqueFormSlug(input.name, input.slug);

  let form;
  try {
    form = await prisma.form.create({
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
      redirect(`/admin/modules/forms?error=${encodeURIComponent("That form URL is already in use. Try another slug.")}`);
    }

    throw error;
  }

  refreshForms(form.slug);
  redirect(`/admin/modules/forms?saved=form&form=${form.id}`);
}

export async function updateFormAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(formUpdateSchema, formData, "/admin/modules/forms");
  const current = await prisma.form.findUnique({
    where: { id: input.id },
    select: { slug: true }
  });
  const slug = input.slug ? await generateUniqueFormSlug(input.name, input.slug, input.id) : current?.slug || (await generateUniqueFormSlug(input.name, undefined, input.id));

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
  await requireAdmin();
  const input = await parseForm(formStatusSchema, formData, "/admin/modules/forms");

  const form = await prisma.form.update({
    where: { id: input.id },
    data: { status: input.status },
    select: { slug: true }
  });

  refreshForms(form.slug);
}

export async function duplicateFormAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(duplicateFormSchema, formData, "/admin/modules/forms");
  const source = await prisma.form.findUnique({
    where: { id: input.id },
    include: {
      fields: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  if (!source) {
    redirect(`/admin/modules/forms?error=${encodeURIComponent("Form not found.")}`);
  }

  const slug = await generateUniqueFormSlug(`${source.name} copy`);
  const form = await prisma.form.create({
    data: {
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

export async function deleteFormAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(deleteFormSchema, formData, "/admin/modules/forms");

  const form = await prisma.form.delete({
    where: { id: input.id },
    select: { slug: true }
  });

  refreshForms(form.slug);
  redirect("/admin/modules/forms?saved=delete");
}

export async function createFormFieldAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(fieldSchema, formData, "/admin/modules/forms");

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

  const form = await prisma.form.findUnique({
    where: { id: input.formId },
    select: { slug: true }
  });

  refreshForms(form?.slug);
  redirect(`/admin/modules/forms?saved=field&form=${input.formId}`);
}

export async function updateFormFieldAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(fieldUpdateSchema, formData, "/admin/modules/forms");

  await prisma.formField.update({
    where: { id: input.id },
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

  const form = await prisma.form.findUnique({
    where: { id: input.formId },
    select: { slug: true }
  });

  refreshForms(form?.slug);
  redirect(`/admin/modules/forms?saved=field&form=${input.formId}`);
}

export async function deleteFormFieldAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(fieldDeleteSchema, formData, "/admin/modules/forms");

  const field = await prisma.formField.delete({
    where: { id: input.id },
    select: { form: { select: { slug: true } } }
  });

  refreshForms(field.form.slug);
  redirect(`/admin/modules/forms?saved=field-delete&form=${input.formId}`);
}

function publicFieldName(fieldId: string) {
  return `field-${fieldId}`;
}

function redirectWithPublicError(slug: string, message: string): never {
  redirect(`/forms/${slug}?error=${encodeURIComponent(message)}`);
}

export async function createPublicFormSubmissionAction(formData: FormData) {
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("forms")) {
    redirect("/");
  }

  const formId = String(formData.get("formId") || "");
  const form = await prisma.form.findFirst({
    where: {
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

  if (String(formData.get(hiddenHoneypotField) || "").trim()) {
    redirect(`/forms/${form.slug}?submitted=1`);
  }

  const rateLimitMessage = await publicRateLimitMessage("form_submission");
  if (rateLimitMessage) {
    redirectWithPublicError(form.slug, rateLimitMessage);
  }

  const data: Record<string, { label: string; type: FormFieldType; value: string }> = {};
  let submitterName = "";
  let submitterEmail = "";

  for (const field of form.fields) {
    const key = publicFieldName(field.id);
    const rawValue = field.type === FormFieldType.CHECKBOX ? (formData.get(key) === "on" ? "yes" : "") : String(formData.get(key) || "").trim();
    const value = field.type === FormFieldType.HIDDEN ? field.placeholder : rawValue;

    if (field.isRequired && !value) {
      redirectWithPublicError(form.slug, `Complete ${field.label}.`);
    }

    if (field.type === FormFieldType.EMAIL && value && !z.email().safeParse(value).success) {
      redirectWithPublicError(form.slug, "Use a valid email address.");
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
      where: { email: submitterEmail },
      select: { id: true }
    });

    const client = existingClient
      ? existingClient
      : await prisma.client.create({
          data: {
            name: submitterName || submitterEmail,
            email: submitterEmail,
            status: "lead"
          }
        });
    clientId = client.id;
  }

  const headerStore = await headers();

  const submission = await prisma.formSubmission.create({
    data: {
      formId: form.id,
      clientId,
      submitterName,
      submitterEmail,
      data,
      metadata: {
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
  redirect(`/forms/${form.slug}?submitted=1`);
}
