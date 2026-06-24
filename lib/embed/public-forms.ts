import "server-only";

import { AnalyticsEventType, FormAttachmentTargetType, FormDestination, FormFieldRole, FormFieldType, FormSignatureCaptureType, FormStatus } from "@prisma/client";
import { headers } from "next/headers";
import { z } from "zod";
import { recordAuditLog } from "@/lib/audit";
import { defaultClientStatus } from "@/lib/clients/status";
import { queueFormSubmittedEmail } from "@/lib/email";
import { EmbedRequestError } from "@/lib/embed/gateway";
import { emitAnalyticsEvent, emitModuleEvent, requestAttribution } from "@/lib/events/emit";
import { deleteMediaAsset, uploadMedia } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { computeVisibleFieldIds } from "@/modules/forms/conditional-logic";
import { formAnalyticsEvents } from "@/modules/forms/analytics";
import { normalizeUploadRules, validateUploadedFile } from "@/modules/forms/upload-fields";
import { validateFormFieldValue } from "@/modules/forms/validation-rules";

const hiddenHoneypotField = "companyWebsite";
const maxSubmissionUploadBytes = 25 * 1024 * 1024;
const signatureConsentStatement =
  "I agree that this electronic signature is the legal equivalent of my handwritten signature and that the information submitted with this form is accurate.";

const signaturePayloadSchema = z.object({
  capturedSignature: z.string().trim().max(200000),
  consentStatement: z.string().trim().max(1000).optional(),
  signerName: z.string().trim().max(240),
  type: z.enum(FormSignatureCaptureType)
});

function publicFieldName(fieldId: string) {
  return `field-${fieldId}`;
}

function publicFieldConsentName(fieldId: string) {
  return `${publicFieldName(fieldId)}-consent`;
}

function publicFileFromFormData(formData: FormData, fieldId: string) {
  const value = formData.get(publicFieldName(fieldId));
  return value instanceof File && value.size > 0 ? value : null;
}

function firstForwardedIp(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function optionsFromJson(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function parseSignaturePayload(rawValue: string) {
  if (!rawValue) return null;
  try {
    const parsed = signaturePayloadSchema.safeParse(JSON.parse(rawValue));
    if (!parsed.success) return null;
    const capturedSignature = parsed.data.capturedSignature.trim();
    const signerName = parsed.data.signerName.trim();
    if (!capturedSignature && !signerName) return null;
    return {
      captureType: parsed.data.type,
      capturedSignature,
      consentStatement: parsed.data.consentStatement?.trim() || signatureConsentStatement,
      signerName
    };
  } catch {
    return null;
  }
}

function validSignaturePayload(signature: NonNullable<ReturnType<typeof parseSignaturePayload>>) {
  if (!signature.signerName) return false;
  if (!signature.capturedSignature) return false;
  if (signature.captureType === FormSignatureCaptureType.DRAWN) return signature.capturedSignature.startsWith("data:image/png;base64,");
  return signature.capturedSignature === signature.signerName;
}

function publicFormField(field: {
  conditionalLogic: unknown;
  helpText: string;
  id: string;
  isRequired: boolean;
  label: string;
  options: unknown;
  pageNumber: number;
  placeholder: string;
  type: FormFieldType;
  validationRules: unknown;
}) {
  const uploadRules = field.type === FormFieldType.FILE ? normalizeUploadRules(field.validationRules) : undefined;
  return {
    conditionalLogic: field.conditionalLogic,
    helpText: field.helpText,
    id: field.id,
    inputName: publicFieldName(field.id),
    isRequired: field.isRequired,
    label: field.label,
    options: optionsFromJson(field.options),
    pageNumber: field.pageNumber,
    placeholder: field.placeholder,
    type: field.type,
    uploadRules,
    validationRules: field.validationRules
  };
}

export async function getPublicFormDefinition(input: { siteId: string; slug: string }) {
  const form = await prisma.form.findFirst({
    where: { siteId: input.siteId, slug: input.slug, status: FormStatus.ACTIVE },
    include: { fields: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }
  });
  if (!form) throw new EmbedRequestError("Form not found.", 404);

  return {
    form: {
      description: form.description,
      enableSteps: form.enableSteps,
      fields: form.fields.map(publicFormField),
      id: form.id,
      name: form.name,
      slug: form.slug,
      submitButtonLabel: form.submitButtonLabel,
      successMessage: form.successMessage
    }
  };
}

function parseAttachmentContext(formData: FormData) {
  const attachmentTargetType = String(formData.get("attachmentTargetType") || "");
  const attachmentTargetId = String(formData.get("attachmentTargetId") || "").trim();
  const hasAttachmentContext = Boolean(attachmentTargetType || attachmentTargetId);
  const parsedAttachmentType = z.enum(FormAttachmentTargetType).safeParse(attachmentTargetType);
  if (!hasAttachmentContext) return null;
  if (!parsedAttachmentType.success || !attachmentTargetId) {
    throw new EmbedRequestError("This form link is missing its attachment context.", 400);
  }
  return { targetId: attachmentTargetId, targetType: parsedAttachmentType.data };
}

export async function createPublicFormSubmission(input: {
  formData: FormData;
  pathname: string;
  searchParams: Record<string, string | string[] | undefined>;
  siteId: string;
  slug: string;
}) {
  const form = await prisma.form.findFirst({
    where: { siteId: input.siteId, slug: input.slug, status: FormStatus.ACTIVE },
    include: { fields: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }
  });
  if (!form) throw new EmbedRequestError("Form not found.", 404);

  const attachmentContext = parseAttachmentContext(input.formData);
  const formAttachment = attachmentContext
    ? await prisma.formAttachment.findFirst({
        where: {
          formId: form.id,
          siteId: input.siteId,
          targetId: attachmentContext.targetId,
          targetType: attachmentContext.targetType
        },
        select: { id: true, isRequired: true, targetId: true, targetType: true }
      })
    : null;
  if (attachmentContext && !formAttachment) throw new EmbedRequestError("This form is not attached to that record.", 400);

  if (String(input.formData.get(hiddenHoneypotField) || "").trim()) {
    return { submission: null, successMessage: form.successMessage };
  }

  const uploadedAssetIds: string[] = [];
  let uploadedBytesTotal = 0;
  let submissionPersisted = false;
  const data: Record<string, { file?: { assetId: string; filename: string; mimeType: string; sizeBytes: number }; label: string; type: FormFieldType; value: string }> = {};
  const signatureRecords: Array<{
    captureType: FormSignatureCaptureType;
    capturedSignature: string;
    consentStatement: string;
    fieldId: string;
    label: string;
    signerName: string;
  }> = [];
  let submitterName = "";
  let submitterEmail = "";
  const submittedValues: Record<string, string> = {};

  for (const field of form.fields) {
    const key = publicFieldName(field.id);
    const rawValue =
      field.type === FormFieldType.CHECKBOX
        ? input.formData.get(key) === "on"
          ? "yes"
          : ""
        : field.type === FormFieldType.FILE
          ? publicFileFromFormData(input.formData, field.id)?.name.trim() || ""
          : String(input.formData.get(key) || "").trim();
    submittedValues[field.id] = field.type === FormFieldType.HIDDEN ? field.placeholder : rawValue;
  }

  const visibleFieldIds = computeVisibleFieldIds(form.fields, submittedValues);
  try {
    for (const field of form.fields) {
      const rawValue = submittedValues[field.id] || "";
      const value = field.type === FormFieldType.HIDDEN ? field.placeholder : rawValue;
      if (!visibleFieldIds.has(field.id)) {
        data[field.id] = { label: field.label, type: field.type, value: "" };
        continue;
      }

      if (field.type === FormFieldType.SIGNATURE) {
        const signature = parseSignaturePayload(rawValue);
        const consentAccepted = input.formData.get(publicFieldConsentName(field.id)) === "on";
        const validSignature = signature ? validSignaturePayload(signature) : false;
        if (field.isRequired && !validSignature) throw new EmbedRequestError(`Complete ${field.label}.`, 400);
        if (signature && !validSignature) throw new EmbedRequestError(`Complete ${field.label}.`, 400);
        if (signature && !consentAccepted) throw new EmbedRequestError("Accept the electronic signature consent statement.", 400);
        if (signature) {
          signatureRecords.push({
            captureType: signature.captureType,
            capturedSignature: signature.capturedSignature,
            consentStatement: signature.consentStatement,
            fieldId: field.id,
            label: field.label,
            signerName: signature.signerName
          });
        }
        data[field.id] = {
          label: field.label,
          type: field.type,
          value: signature ? `Signed (${signature.captureType.toLowerCase()}) by ${signature.signerName}` : ""
        };
        continue;
      }

      if (field.type === FormFieldType.FILE) {
        const file = publicFileFromFormData(input.formData, field.id);
        const uploadMessage = validateUploadedFile({ fieldLabel: field.label, file, isRequired: field.isRequired, rules: field.validationRules });
        if (uploadMessage) throw new EmbedRequestError(uploadMessage, 400);
        if (!file) {
          data[field.id] = { label: field.label, type: field.type, value: "" };
          continue;
        }
        const uploadRules = normalizeUploadRules(field.validationRules);
        const asset = await uploadMedia(
          file,
          {
            folder: `forms/${form.id}`,
            isDecorative: true,
            isPrivate: true,
            tags: ["forms", form.slug],
            usageContext: `form:${form.id}:field:${field.id}`
          },
          undefined,
          input.siteId,
          { allowedMimeTypes: uploadRules.allowedMimeTypes, maxBytes: uploadRules.maxSizeBytes, requireImage: false }
        );
        uploadedAssetIds.push(asset.id);
        uploadedBytesTotal += asset.sizeBytes;
        if (uploadedBytesTotal > maxSubmissionUploadBytes) throw new EmbedRequestError("Total upload size is too large for one submission.", 400);
        data[field.id] = {
          file: { assetId: asset.id, filename: asset.filename, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes },
          label: field.label,
          type: field.type,
          value: asset.filename
        };
        continue;
      }

      const validationMessage = validateFormFieldValue({ fieldLabel: field.label, isRequired: field.isRequired, rules: field.validationRules, value });
      if (validationMessage) throw new EmbedRequestError(validationMessage, 400);
      if (field.type === FormFieldType.EMAIL && value && !z.email().safeParse(value).success) throw new EmbedRequestError("Use a valid email address.", 400);
      data[field.id] = { label: field.label, type: field.type, value };
      if (!submitterName && field.fieldRole === FormFieldRole.SUBMITTER_NAME && value) submitterName = value;
      if (!submitterEmail && (field.fieldRole === FormFieldRole.SUBMITTER_EMAIL || field.type === FormFieldType.EMAIL) && value) {
        submitterEmail = value.toLowerCase();
      }
    }

    let clientId: string | undefined;
    if ((form.destination === FormDestination.CLIENT || form.destination === FormDestination.INQUIRY) && submitterEmail) {
      const existingClient = await prisma.client.findUnique({ where: { siteId_email: { siteId: input.siteId, email: submitterEmail } }, select: { id: true } });
      const client =
        existingClient ||
        (await prisma.client.create({
          data: { siteId: input.siteId, name: submitterName || submitterEmail, email: submitterEmail, status: defaultClientStatus }
        }));
      clientId = client.id;
    }

    const headerStore = await headers();
    const ipAddress = firstForwardedIp(headerStore.get("x-forwarded-for")) || headerStore.get("x-real-ip")?.trim() || headerStore.get("cf-connecting-ip")?.trim() || "";
    const userAgent = headerStore.get("user-agent") || "";
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
        clientId,
        data,
        formAttachmentId: formAttachment?.id,
        formId: form.id,
        metadata: { ...attachmentMetadata, destination: form.destination, userAgent },
        submitterEmail,
        submitterName
      }
    });
    submissionPersisted = true;

    if (signatureRecords.length) {
      await prisma.formSignature.createMany({
        data: signatureRecords.map((signature) => ({
          captureType: signature.captureType,
          capturedSignature: signature.capturedSignature,
          consentStatement: signature.consentStatement,
          formFieldId: signature.fieldId,
          formId: form.id,
          formSubmissionId: submission.id,
          ipAddress,
          signerEmail: submitterEmail,
          signerName: signature.signerName,
          siteId: input.siteId,
          userAgent
        }))
      });
      await recordAuditLog({
        action: "form.signature_captured",
        metadata: {
          formId: form.id,
          formName: form.name,
          formSlug: form.slug,
          signatureCount: signatureRecords.length,
          submissionId: submission.id
        },
        siteId: input.siteId,
        targetId: submission.id,
        targetLabel: form.name,
        targetType: "form_submission"
      });
    }

    await queueFormSubmittedEmail(
      { id: form.id, name: form.name, notificationEmail: form.notificationEmail, siteId: input.siteId },
      { id: submission.id, submitterName, submitterEmail, data }
    );
    const attribution = await requestAttribution(input.searchParams, input.pathname || `/forms/${form.slug}`);
    await emitModuleEvent("form.submitted", {
      ...attribution,
      actorEmail: submitterEmail,
      metadata: { ...attachmentMetadata, clientId, destination: form.destination, formId: form.id, formName: form.name, formSlug: form.slug },
      relatedId: submission.id,
      relatedType: "form_submission",
      siteId: input.siteId
    });
    await emitAnalyticsEvent({
      ...attribution,
      actorEmail: submitterEmail,
      eventName: formAnalyticsEvents.submit,
      eventType: AnalyticsEventType.LEAD_SUBMITTED,
      metadata: { ...attachmentMetadata, clientId, destination: form.destination, formId: form.id, formName: form.name, formSlug: form.slug, submissionId: submission.id },
      relatedId: form.id,
      relatedType: "form",
      siteId: input.siteId
    });

    return { submission: { id: submission.id }, successMessage: form.successMessage };
  } catch (error) {
    if (!submissionPersisted && uploadedAssetIds.length) {
      await Promise.all(uploadedAssetIds.map((assetId) => deleteMediaAsset(assetId, input.siteId)));
    }
    throw error;
  }
}
