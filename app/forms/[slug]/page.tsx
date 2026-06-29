import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { AnalyticsEventType, FormFieldType, FormStatus, type FormField } from "@prisma/client";
import { CalendarDays, MessageSquare } from "lucide-react";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/structured-data";
import { emitAnalyticsEvent, requestAttribution } from "@/lib/events/emit";
import { parseFormAttachmentTarget } from "@/lib/forms/attachments";
import { buildBreadcrumbJsonLd, buildPageMetadata, getCanonicalBaseUrl } from "@/lib/seo";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";
import { prisma } from "@/lib/prisma";
import { createPublicFormSubmissionAction } from "@/modules/forms/actions";
import { formAnalyticsEvents } from "@/modules/forms/analytics";
import { normalizeUploadRules } from "@/modules/forms/upload-fields";
import { normalizeValidationRules } from "@/modules/forms/validation-rules";
import { PublicFormBehavior } from "./public-form-behavior";
import { SignatureField } from "./signature-field";
import { ButtonLink, Card, Switch } from "@/components/ui";

export const dynamic = "force-dynamic";

type PublicFormPageProps = {
  params: Promise<{slug: string;}>;
  searchParams: Promise<Record<string, string | string[] | undefined> & {submitted?: string;error?: string;}>;
};

export async function generateMetadata({ params }: PublicFormPageProps): Promise<Metadata> {
  const [{ slug }, settings] = await Promise.all([params, getSiteSettings()]);
  if (!settings.enabledModuleIds.includes("forms")) return {};

  const form = await prisma.form.findFirst({
    where: {
      siteId: settings.siteId,
      slug,
      status: FormStatus.ACTIVE
    },
    select: { description: true, name: true }
  });

  if (!form) return {};

  return buildPageMetadata(settings, {
    canonicalPath: `/forms/${slug}`,
    description: form.description || `Submit ${form.name} to ${settings.businessName}.`,
    title: form.name
  });
}

function fieldInputName(fieldId: string) {
  return `field-${fieldId}`;
}

function optionsFromJson(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function labelText(label: string, isRequired: boolean) {
  return (
    <>
      {label}
      {isRequired ? <span aria-hidden="true"> *</span> : null}
    </>);

}

function safePatternAttribute(pattern?: string) {
  if (!pattern) return undefined;

  try {
    new RegExp(pattern);
    return pattern;
  } catch {
    return undefined;
  }
}

function renderField(field: FormField) {
  const name = fieldInputName(field.id);
  const options = optionsFromJson(field.options);
  const helpId = field.helpText ? `${field.id}-help` : undefined;
  const validationRules = normalizeValidationRules(field.validationRules);
  const hasNumericRange = validationRules.minValue !== undefined || validationRules.maxValue !== undefined;
  const validationAttributes = {
    maxLength: validationRules.maxLength,
    minLength: validationRules.minLength
  };
  const inputValidationAttributes = {
    ...validationAttributes,
    inputMode: hasNumericRange ? "decimal" as const : undefined,
    pattern: safePatternAttribute(validationRules.pattern),
    title: validationRules.pattern ? "Use the expected format." : undefined
  };
  const wrapField = (children: ReactNode, forceHidden = false) =>
  <div
    data-form-field-id={field.id}
    data-form-field-page={field.pageNumber}
    hidden={forceHidden}
    key={field.id}>
    
      {children}
    </div>;

  const commonProps = {
    id: field.id,
    name,
    required: field.isRequired,
    "aria-required": field.isRequired || undefined,
    "aria-describedby": helpId
  };

  if (field.type === FormFieldType.HIDDEN) {
    return wrapField(<input type="hidden" name={name} value={field.placeholder} />, true);
  }

  if (field.type === FormFieldType.TEXTAREA) {
    return wrapField(
      <div className="ui-field">
        <label htmlFor={field.id}>{labelText(field.label, field.isRequired)}</label>
        <textarea {...commonProps} {...validationAttributes} placeholder={field.placeholder} />
        {field.helpText ?
        <small className="ui-zero" id={helpId}>
            {field.helpText}
          </small> :
        null}
      </div>
    );
  }

  if (field.type === FormFieldType.SELECT) {
    return wrapField(
      <div className="ui-field">
        <label htmlFor={field.id}>{labelText(field.label, field.isRequired)}</label>
        <select {...commonProps} defaultValue="">
          <option value="" disabled>
            Select one
          </option>
          {options.map((option) =>
          <option key={option} value={option}>
              {option}
            </option>
          )}
        </select>
        {field.helpText ?
        <small className="ui-zero" id={helpId}>
            {field.helpText}
          </small> :
        null}
      </div>
    );
  }

  if (field.type === FormFieldType.RADIO) {
    return wrapField(
      <fieldset className="ui-field ui-zero" aria-describedby={helpId}>
        <legend className="ui-zero">
          {labelText(field.label, field.isRequired)}
        </legend>
        <div className="ui-zero">
          {options.map((option) =>
          <label className="ui-zero" key={option}>
              <input name={name} required={field.isRequired} type="radio" value={option} />
              {option}
            </label>
          )}
        </div>
        {field.helpText ?
        <small className="ui-zero" id={helpId}>
            {field.helpText}
          </small> :
        null}
      </fieldset>
    );
  }

  if (field.type === FormFieldType.CHECKBOX) {
    return wrapField(
      <div className="ui-field">
        <Switch
          aria-describedby={helpId}
          aria-required={field.isRequired || undefined}
          label={labelText(field.label, field.isRequired)}
          name={name}
          required={field.isRequired}
          variant="inline"
        />
        {field.helpText ?
        <small className="ui-zero" id={helpId}>
            {field.helpText}
          </small> :
        null}
      </div>
    );
  }

  if (field.type === FormFieldType.FILE) {
    const uploadRules = normalizeUploadRules(field.validationRules);

    return wrapField(
      <div className="ui-field">
        <label htmlFor={field.id}>{labelText(field.label, field.isRequired)}</label>
        <input {...commonProps} accept={uploadRules.allowedMimeTypes.join(",")} type="file" />
        {field.helpText ?
        <small className="ui-zero" id={helpId}>
            {field.helpText}
          </small> :
        null}
      </div>
    );
  }

  if (field.type === FormFieldType.SIGNATURE) {
    return wrapField(
      <SignatureField
        fieldId={field.id}
        helpText={field.helpText}
        isRequired={field.isRequired}
        label={field.label}
        name={name}
        placeholder={field.placeholder}
        validationRules={field.validationRules} />

    );
  }

  const inputType =
  field.type === FormFieldType.EMAIL ? "email" : field.type === FormFieldType.PHONE ? "tel" : field.type === FormFieldType.DATE ? "date" : "text";

  return wrapField(
    <div className="ui-field">
      <label htmlFor={field.id}>{labelText(field.label, field.isRequired)}</label>
      <input {...commonProps} {...inputValidationAttributes} placeholder={field.placeholder} type={inputType} />
      {field.helpText ?
      <small className="ui-zero" id={helpId}>
          {field.helpText}
        </small> :
      null}
    </div>
  );
}

export default async function PublicFormPage({ params, searchParams }: PublicFormPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const settings = await getSiteSettings();
  const baseUrl = await getCanonicalBaseUrl(settings.siteId);
  const attachmentTarget = parseFormAttachmentTarget(query);
  const form = await prisma.form.findFirst({
    where: {
      siteId: settings.siteId,
      slug,
      status: FormStatus.ACTIVE
    },
    include: {
      fields: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  if (!settings.enabledModuleIds.includes("forms")) notFound();
  if (!form) notFound();
  const attachment = attachmentTarget ?
  await prisma.formAttachment.findFirst({
    where: {
      formId: form.id,
      siteId: settings.siteId,
      targetId: attachmentTarget.targetId,
      targetType: attachmentTarget.targetType
    },
    select: { id: true, isRequired: true, targetId: true, targetType: true }
  }) :
  null;
  if (attachmentTarget && !attachment) notFound();
  const testimonialsEnabled = settings.enabledModuleIds.includes("testimonials");
  if (!query.submitted) {
    await emitAnalyticsEvent({
      ...(await requestAttribution(query, `/forms/${form.slug}`)),
      dedupeWindowMinutes: 60,
      eventName: formAnalyticsEvents.view,
      eventType: AnalyticsEventType.CUSTOM,
      metadata: {
        attachmentTargetId: attachment?.targetId,
        attachmentTargetType: attachment?.targetType,
        destination: form.destination,
        formId: form.id,
        formName: form.name,
        formSlug: form.slug,
        isRequiredAttachment: attachment?.isRequired
      },
      relatedId: form.id,
      relatedType: "form"
    });
  }

  return (
    <main className="site-shell" style={themeToCssVars(settings)}>
      <JsonLd
        data={buildBreadcrumbJsonLd(
          [
          { name: "Home", path: "/" },
          { name: form.name, path: `/forms/${form.slug}` }],

          baseUrl
        )} />
      
      <nav className="site-nav">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{settings.businessName}</span>
        </Link>
        <div className="site-nav-links">
          <ButtonLink href="/book" variant="secondary">
            <CalendarDays size={18} />
            Book
          </ButtonLink>
          {testimonialsEnabled ?
          <ButtonLink href="/testimonials" variant="secondary">
              <MessageSquare size={18} />
              Reviews
            </ButtonLink> :
          null}
        </div>
      </nav>

      <section className="section ui-zero">
        <div className="booking-intro">
          <p className="eyebrow">Form</p>
          <h1>{form.name}</h1>
          {form.description ? <p className="lead">{form.description}</p> : null}
          {attachment ?
          <p className={attachment.isRequired ? "ui-badge ui-badge-success" : "ui-badge"}>
              {attachment.isRequired ? "Required" : "Optional"} attached form
            </p> :
          null}
        </div>

        {query.submitted ?
        <div className="success-message" role="status" aria-live="polite">
            {form.successMessage}
          </div> :
        null}
        {query.error ?
        <div className="error" role="alert">
            {decodeURIComponent(query.error)}
          </div> :
        null}

        <Card action={createPublicFormSubmissionAction} encType="multipart/form-data" as="form" minHeight="none" bodyClassName="form-grid">
          <input type="hidden" name="formId" value={form.id} />
          {attachment ?
          <>
              <input type="hidden" name="attachmentTargetType" value={attachment.targetType} />
              <input type="hidden" name="attachmentTargetId" value={attachment.targetId} />
            </> :
          null}
          <input className="ui-zero"
          aria-hidden="true"
          autoComplete="off"
          name="companyWebsite"

          tabIndex={-1}
          type="text" />
          
          {form.fields.map(renderField)}
          {!form.fields.length ? <p className="empty-state">This form does not have fields yet.</p> : null}
          <PublicFormBehavior
            enableSteps={form.enableSteps}
            formId={form.id}
            formPath={`/forms/${form.slug}`}
            fields={form.fields.map((field) => ({
              conditionalLogic: field.conditionalLogic,
              id: field.id,
              inputName: fieldInputName(field.id),
              isRequired: field.isRequired,
              label: field.label,
              pageNumber: field.pageNumber,
              type: field.type,
              validationRules: field.validationRules
            }))}
            submitButtonLabel={form.submitButtonLabel} />
          
        </Card>
      </section>
    </main>);

}
