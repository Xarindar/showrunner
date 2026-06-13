import type { Metadata } from "next";
import Link from "next/link";
import { FormFieldType, FormStatus, type FormField } from "@prisma/client";
import { CalendarDays, MessageSquare } from "lucide-react";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/structured-data";
import { buildBreadcrumbJsonLd, buildPageMetadata, getCanonicalBaseUrl } from "@/lib/seo";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";
import { prisma } from "@/lib/prisma";
import { createPublicFormSubmissionAction } from "@/modules/forms/actions";

export const dynamic = "force-dynamic";

type PublicFormPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ submitted?: string; error?: string }>;
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

function renderField(field: FormField) {
  const name = fieldInputName(field.id);
  const options = optionsFromJson(field.options);
  const helpId = field.helpText ? `${field.id}-help` : undefined;
  const commonProps = {
    id: field.id,
    name,
    required: field.isRequired,
    "aria-describedby": helpId
  };

  if (field.type === FormFieldType.HIDDEN) {
    return <input key={field.id} type="hidden" name={name} value={field.placeholder} />;
  }

  if (field.type === FormFieldType.TEXTAREA) {
    return (
      <div className="field" key={field.id}>
        <label htmlFor={field.id}>{field.label}</label>
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
    return (
      <div className="field" key={field.id}>
        <label htmlFor={field.id}>{field.label}</label>
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
    return (
      <fieldset className="field" key={field.id} style={{ border: 0, margin: 0, padding: 0 }}>
        <legend style={{ color: "var(--muted)", fontSize: "0.88rem", fontWeight: 700 }}>{field.label}</legend>
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
    return (
      <div className="field" key={field.id}>
        <label style={{ alignItems: "center", color: "var(--ink)", display: "flex", gap: 8 }}>
          <input name={name} required={field.isRequired} type="checkbox" />
          {field.label}
        </label>
        {field.helpText ? (
          <small id={helpId} style={{ color: "var(--muted)" }}>
            {field.helpText}
          </small>
        ) : null}
      </div>
    );
  }

  const inputType =
    field.type === FormFieldType.EMAIL ? "email" : field.type === FormFieldType.PHONE ? "tel" : field.type === FormFieldType.DATE ? "date" : "text";
  const placeholder = field.type === FormFieldType.SIGNATURE ? field.placeholder || "Type your full name" : field.placeholder;

  return (
    <div className="field" key={field.id}>
      <label htmlFor={field.id}>{field.label}</label>
      <input {...commonProps} placeholder={placeholder} type={inputType} />
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
        </div>

        {query.submitted ? <div className="success-message">{form.successMessage}</div> : null}
        {query.error ? <div className="error">{decodeURIComponent(query.error)}</div> : null}

        <form action={createPublicFormSubmissionAction} className="card form-grid">
          <input type="hidden" name="formId" value={form.id} />
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
          <button className="button" type="submit">
            {form.submitButtonLabel}
          </button>
        </form>
      </section>
    </main>
  );
}
