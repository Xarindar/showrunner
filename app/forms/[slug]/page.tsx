import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { FormFieldType, FormStatus, type FormField } from "@prisma/client";
import { CalendarDays, MessageSquare } from "lucide-react";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/structured-data";
import { parseFormAttachmentTarget } from "@/lib/forms/attachments";
import { buildBreadcrumbJsonLd, buildPageMetadata, getCanonicalBaseUrl } from "@/lib/seo";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";
import { prisma } from "@/lib/prisma";
import { createPublicFormSubmissionAction } from "@/modules/forms/actions";
import { PublicFormBehavior } from "./public-form-behavior";
import { SignatureField } from "./signature-field";

export const dynamic = "force-dynamic";

type PublicFormPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined> & { submitted?: string; error?: string }>;
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
    </>
  );
}

function renderField(field: FormField) {
  const name = fieldInputName(field.id);
  const options = optionsFromJson(field.options);
  const helpId = field.helpText ? `${field.id}-help` : undefined;
  const wrapField = (children: ReactNode, forceHidden = false) => (
    <div
      data-form-field-id={field.id}
      data-form-field-page={field.pageNumber}
      hidden={forceHidden}
      key={field.id}
    >
      {children}
    </div>
  );
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
      <div className="field">
        <label htmlFor={field.id}>{labelText(field.label, field.isRequired)}</label>
        <textarea {...commonProps} placeholder={field.placeholder} />
        {field.helpText ? (
          <small id={helpId} style={{ color: "var(--muted)" }}>
            {field.helpText}
          </small>
        ) : null}
      </div>
    );
  }

  if (field.type === FormFieldType.SELECT) {
    return wrapField(
      <div className="field">
        <label htmlFor={field.id}>{labelText(field.label, field.isRequired)}</label>
        <select {...commonProps} defaultValue="">
          <option value="" disabled>
            Select one
          </option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {field.helpText ? (
          <small id={helpId} style={{ color: "var(--muted)" }}>
            {field.helpText}
          </small>
        ) : null}
      </div>
    );
  }

  if (field.type === FormFieldType.RADIO) {
    return wrapField(
      <fieldset className="field" style={{ border: 0, margin: 0, padding: 0 }} aria-describedby={helpId}>
        <legend style={{ color: "var(--muted)", fontSize: "0.88rem", fontWeight: 700 }}>
          {labelText(field.label, field.isRequired)}
        </legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {options.map((option) => (
            <label key={option} style={{ alignItems: "center", display: "flex", gap: 8 }}>
              <input name={name} required={field.isRequired} type="radio" value={option} />
              {option}
            </label>
          ))}
        </div>
        {field.helpText ? (
          <small id={helpId} style={{ color: "var(--muted)" }}>
            {field.helpText}
          </small>
        ) : null}
      </fieldset>
    );
  }

  if (field.type === FormFieldType.CHECKBOX) {
    return wrapField(
      <div className="field">
        <label style={{ alignItems: "center", color: "var(--ink)", display: "flex", gap: 8 }}>
          <input
            name={name}
            required={field.isRequired}
            aria-required={field.isRequired || undefined}
            aria-describedby={helpId}
            type="checkbox"
          />
          {labelText(field.label, field.isRequired)}
        </label>
        {field.helpText ? (
          <small id={helpId} style={{ color: "var(--muted)" }}>
            {field.helpText}
          </small>
        ) : null}
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
      />
    );
  }

  const inputType =
    field.type === FormFieldType.EMAIL ? "email" : field.type === FormFieldType.PHONE ? "tel" : field.type === FormFieldType.DATE ? "date" : "text";

  return wrapField(
    <div className="field">
      <label htmlFor={field.id}>{labelText(field.label, field.isRequired)}</label>
      <input {...commonProps} placeholder={field.placeholder} type={inputType} />
      {field.helpText ? (
        <small id={helpId} style={{ color: "var(--muted)" }}>
          {field.helpText}
        </small>
      ) : null}
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
  const attachment = attachmentTarget
    ? await prisma.formAttachment.findFirst({
        where: {
          formId: form.id,
          siteId: settings.siteId,
          targetId: attachmentTarget.targetId,
          targetType: attachmentTarget.targetType
        },
        select: { id: true, isRequired: true, targetId: true, targetType: true }
      })
    : null;
  if (attachmentTarget && !attachment) notFound();
  const testimonialsEnabled = settings.enabledModuleIds.includes("testimonials");

  return (
    <main className="site-shell" style={themeToCssVars(settings)}>
      <JsonLd
        data={buildBreadcrumbJsonLd(
          [
            { name: "Home", path: "/" },
            { name: form.name, path: `/forms/${form.slug}` }
          ],
          baseUrl
        )}
      />
      <nav className="site-nav">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{settings.businessName}</span>
        </Link>
        <div className="site-nav-links">
          <Link href="/book" className="button secondary">
            <CalendarDays size={18} />
            Book
          </Link>
          {testimonialsEnabled ? (
            <Link href="/testimonials" className="button secondary">
              <MessageSquare size={18} />
              Reviews
            </Link>
          ) : null}
        </div>
      </nav>

      <section className="section" style={{ maxWidth: 860 }}>
        <div className="booking-intro">
          <p className="eyebrow">Form</p>
          <h1>{form.name}</h1>
          {form.description ? <p className="lead">{form.description}</p> : null}
          {attachment ? (
            <p className={attachment.isRequired ? "pill success" : "pill"}>
              {attachment.isRequired ? "Required" : "Optional"} attached form
            </p>
          ) : null}
        </div>

        {query.submitted ? (
          <div className="success-message" role="status" aria-live="polite">
            {form.successMessage}
          </div>
        ) : null}
        {query.error ? (
          <div className="error" role="alert">
            {decodeURIComponent(query.error)}
          </div>
        ) : null}

        <form action={createPublicFormSubmissionAction} className="card form-grid">
          <input type="hidden" name="formId" value={form.id} />
          {attachment ? (
            <>
              <input type="hidden" name="attachmentTargetType" value={attachment.targetType} />
              <input type="hidden" name="attachmentTargetId" value={attachment.targetId} />
            </>
          ) : null}
          <input
            aria-hidden="true"
            autoComplete="off"
            name="companyWebsite"
            style={{ display: "none" }}
            tabIndex={-1}
            type="text"
          />
          {form.fields.map(renderField)}
          {!form.fields.length ? <p className="empty-state">This form does not have fields yet.</p> : null}
          <PublicFormBehavior
            enableSteps={form.enableSteps}
            fields={form.fields.map((field) => ({
              conditionalLogic: field.conditionalLogic,
              id: field.id,
              inputName: fieldInputName(field.id),
              pageNumber: field.pageNumber,
              type: field.type
            }))}
            submitButtonLabel={form.submitButtonLabel}
          />
        </form>
      </section>
    </main>
  );
}
