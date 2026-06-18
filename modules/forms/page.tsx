import Link from "next/link";
import NextImage from "next/image";
import { FormAttachmentTargetType, FormDestination, FormFieldRole, FormFieldType, FormStatus } from "@prisma/client";
import { ClipboardList, CopyPlus, FileText, Inbox, Paperclip, Plus, Trash2 } from "lucide-react";
import { getAccessibleBookingWhere, getAccessibleFormSubmissionWhere, getAccessibleGalleryWhere, requireAdmin } from "@/lib/auth";
import { enumLabel, formatDateTime, stringArrayCsv } from "@/lib/format";
import { publicFormAttachmentHref } from "@/lib/forms/attachments";
import { isRecord } from "@/lib/objects";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { formAnalyticsEvents, formFunnelEventNames } from "./analytics";
import { conditionalActions, conditionalOperators, normalizeConditionalLogic } from "./conditional-logic";
import { formatUploadSize, normalizeUploadRules } from "./upload-fields";
import { normalizeValidationRules } from "./validation-rules";
import {
  createFormAttachmentAction,
  createFormAction,
  createFormFromTemplateAction,
  createFormFieldAction,
  deleteFormAction,
  deleteFormAttachmentAction,
  deleteFormFieldAction,
  duplicateFormAction,
  updateFormAction,
  updateFormFieldAction,
  updateFormStatusAction } from "./actions";
import { formTemplates } from "./templates";
import { Button, ButtonLink, Card, EqualGrid, Table } from "@/components/ui";

export const dynamic = "force-dynamic";

const pageSize = 20;
const statusFilters = ["all", ...Object.values(FormStatus).map((status) => status.toLowerCase())] as const;
const supportedDestinations = Object.values(FormDestination);
const conditionActionLabels = {
  HIDE: "Hide",
  SHOW: "Show"
} as const;
const conditionOperatorLabels = {
  CONTAINS: "contains",
  EMPTY: "is empty",
  EQUALS: "equals",
  NOT_EMPTY: "is not empty",
  NOT_EQUALS: "does not equal"
} as const;

type FormsPageProps = {
  searchParams: Promise<{saved?: string;error?: string;page?: string;status?: string;form?: string;}>;
};

type BuilderField = {
  conditionalLogic: unknown;
  id: string;
  label: string;
  type: FormFieldType;
  validationRules: unknown;
};

type FormFunnelMetrics = {
  starts: number;
  submits: number;
  views: number;
};

function normalizeStatusFilter(value?: string) {
  return statusFilters.includes(value as (typeof statusFilters)[number]) ? value || "all" : "all";
}

function statusClass(status: FormStatus) {
  if (status === FormStatus.ACTIVE) return "ui-badge ui-badge-success";
  if (status === FormStatus.ARCHIVED) return "ui-badge ui-badge-danger";
  return "ui-badge";
}

function summarizeSubmission(value: unknown) {
  if (!isRecord(value)) return "No response data";

  const entries = Object.entries(value).
  map(([key, item]) => {
    if (isRecord(item) && "value" in item) {
      return [String(item.label || key), item.value] as const;
    }

    return [key, item] as const;
  }).
  filter(([, item]) => String(item || "").trim()).
  slice(0, 4);

  return entries.length ? entries.map(([key, item]) => `${key}: ${String(item)}`).join(" | ") : "No response data";
}

function submissionEntries(value: unknown) {
  if (!isRecord(value)) return [];

  return Object.entries(value).map(([key, item]) => {
    if (isRecord(item) && "value" in item) {
      const file = isRecord(item.file) ?
      {
        assetId: String(item.file.assetId || ""),
        filename: String(item.file.filename || item.value || ""),
        mimeType: String(item.file.mimeType || ""),
        sizeBytes: Number(item.file.sizeBytes || 0)
      } :
      null;

      return {
        file: file?.assetId ? file : null,
        id: key,
        label: String(item.label || key),
        type: String(item.type || "field"),
        value: String(item.value || "")
      };
    }

    return {
      file: null,
      id: key,
      label: key,
      type: "field",
      value: String(item || "")
    };
  });
}

function destinationOptions(current?: FormDestination) {
  const options = [...supportedDestinations];
  if (current && !options.includes(current)) options.push(current);
  return options;
}

function targetKey(targetType: FormAttachmentTargetType, targetId: string) {
  return `${targetType}:${targetId}`;
}

function emptyFunnelMetrics(): FormFunnelMetrics {
  return {
    starts: 0,
    submits: 0,
    views: 0
  };
}

function conversionRate(metrics: FormFunnelMetrics) {
  if (!metrics.views) return "0%";
  return `${Math.round(metrics.submits / metrics.views * 100)}%`;
}

function conditionNeedsValue(operator: keyof typeof conditionOperatorLabels) {
  return operator !== "EMPTY" && operator !== "NOT_EMPTY";
}

function conditionSummary(field: BuilderField, fields: BuilderField[]) {
  const logic = normalizeConditionalLogic(field.conditionalLogic);
  if (!logic.enabled) return null;

  const source = fields.find((candidate) => candidate.id === logic.sourceFieldId);
  const value = conditionNeedsValue(logic.operator) ? ` "${logic.value}"` : "";

  return `${conditionActionLabels[logic.action]} when ${source?.label || "selected field"} ${conditionOperatorLabels[logic.operator]}${value}`;
}

function conditionalControls(input: {field?: BuilderField;fields: BuilderField[];idPrefix: string;}) {
  const logic = normalizeConditionalLogic(input.field?.conditionalLogic);
  const sourceFields = input.fields.filter((field) => field.id !== input.field?.id);
  const hasSourceFields = sourceFields.length > 0;

  return (
    <details>
      <summary>Conditional visibility</summary>
      <div className="form-grid ui-zero">
        <label className="ui-zero">
          <input name="conditionEnabled" type="checkbox" defaultChecked={logic.enabled} disabled={!hasSourceFields} />
          Enable rule
        </label>
        <EqualGrid>
          <div className="ui-field">
            <label htmlFor={`${input.idPrefix}-condition-action`}>Action</label>
            <select id={`${input.idPrefix}-condition-action`} name="conditionAction" defaultValue={logic.action}>
              {conditionalActions.map((action) =>
              <option key={action} value={action}>
                  {conditionActionLabels[action]}
                </option>
              )}
            </select>
          </div>
          <div className="ui-field">
            <label htmlFor={`${input.idPrefix}-condition-source`}>When field</label>
            <select
              id={`${input.idPrefix}-condition-source`}
              name="conditionSourceFieldId"
              defaultValue={logic.sourceFieldId}
              disabled={!hasSourceFields}>
              
              <option value="">{hasSourceFields ? "Choose field" : "Add another field first"}</option>
              {sourceFields.map((field) =>
              <option key={field.id} value={field.id}>
                  {field.label}
                </option>
              )}
            </select>
          </div>
        </EqualGrid>
        <EqualGrid>
          <div className="ui-field">
            <label htmlFor={`${input.idPrefix}-condition-operator`}>Operator</label>
            <select id={`${input.idPrefix}-condition-operator`} name="conditionOperator" defaultValue={logic.operator}>
              {conditionalOperators.map((operator) =>
              <option key={operator} value={operator}>
                  {conditionOperatorLabels[operator]}
                </option>
              )}
            </select>
          </div>
          <div className="ui-field">
            <label htmlFor={`${input.idPrefix}-condition-value`}>Value</label>
            <input id={`${input.idPrefix}-condition-value`} name="conditionValue" defaultValue={logic.value} />
          </div>
        </EqualGrid>
      </div>
    </details>);

}

function validationSummary(field: BuilderField) {
  const rules = normalizeValidationRules(field.validationRules);
  const parts = [];

  if (rules.minLength !== undefined) parts.push(`min ${rules.minLength} chars`);
  if (rules.maxLength !== undefined) parts.push(`max ${rules.maxLength} chars`);
  if (rules.minValue !== undefined) parts.push(`min value ${rules.minValue}`);
  if (rules.maxValue !== undefined) parts.push(`max value ${rules.maxValue}`);
  if (rules.pattern) parts.push("pattern");
  if (rules.requiredMessage) parts.push("custom required message");

  return parts.join(" · ");
}

function uploadSummary(field: BuilderField) {
  if (field.type !== FormFieldType.FILE) return "";
  const rules = normalizeUploadRules(field.validationRules);
  return `${formatUploadSize(rules.maxSizeBytes)} max · ${rules.allowedMimeTypes.join(", ")}`;
}

function validationControls(input: {field?: BuilderField;idPrefix: string;}) {
  const rules = normalizeValidationRules(input.field?.validationRules);

  return (
    <details>
      <summary>Validation rules</summary>
      <div className="form-grid ui-zero">
        <EqualGrid>
          <div className="ui-field">
            <label htmlFor={`${input.idPrefix}-validation-min-length`}>Min length</label>
            <input id={`${input.idPrefix}-validation-min-length`} name="validationMinLength" type="number" min={0} defaultValue={rules.minLength ?? ""} />
          </div>
          <div className="ui-field">
            <label htmlFor={`${input.idPrefix}-validation-max-length`}>Max length</label>
            <input id={`${input.idPrefix}-validation-max-length`} name="validationMaxLength" type="number" min={0} defaultValue={rules.maxLength ?? ""} />
          </div>
        </EqualGrid>
        <EqualGrid>
          <div className="ui-field">
            <label htmlFor={`${input.idPrefix}-validation-min-value`}>Min value</label>
            <input id={`${input.idPrefix}-validation-min-value`} name="validationMinValue" inputMode="decimal" defaultValue={rules.minValue ?? ""} />
          </div>
          <div className="ui-field">
            <label htmlFor={`${input.idPrefix}-validation-max-value`}>Max value</label>
            <input id={`${input.idPrefix}-validation-max-value`} name="validationMaxValue" inputMode="decimal" defaultValue={rules.maxValue ?? ""} />
          </div>
        </EqualGrid>
        <div className="ui-field">
          <label htmlFor={`${input.idPrefix}-validation-pattern`}>Regex pattern</label>
          <input id={`${input.idPrefix}-validation-pattern`} name="validationPattern" defaultValue={rules.pattern || ""} placeholder="^[A-Z0-9-]+$" />
        </div>
        <div className="ui-field">
          <label htmlFor={`${input.idPrefix}-validation-required-message`}>Required message</label>
          <input
            id={`${input.idPrefix}-validation-required-message`}
            name="validationRequiredMessage"
            defaultValue={rules.requiredMessage || ""}
            placeholder="Enter your project code." />
          
        </div>
      </div>
    </details>);

}

function uploadControls(input: {field?: BuilderField;idPrefix: string;}) {
  const rules = normalizeUploadRules(input.field?.validationRules);

  return (
    <details>
      <summary>File upload config</summary>
      <div className="form-grid ui-zero">
        <div className="ui-field">
          <label htmlFor={`${input.idPrefix}-upload-mime-types`}>Allowed MIME types</label>
          <input
            id={`${input.idPrefix}-upload-mime-types`}
            name="uploadAllowedMimeTypes"
            defaultValue={rules.allowedMimeTypes.join(", ")}
            placeholder="image/jpeg, image/png, application/pdf" />
          
        </div>
        <div className="ui-field">
          <label htmlFor={`${input.idPrefix}-upload-max-size`}>Max size (MB)</label>
          <input
            id={`${input.idPrefix}-upload-max-size`}
            name="uploadMaxSizeMb"
            type="number"
            min={1}
            max={25}
            step={0.5}
            defaultValue={Math.round(rules.maxSizeBytes / (1024 * 1024) * 10) / 10} />
          
        </div>
      </div>
    </details>);

}

export default async function FormsPage({ searchParams }: FormsPageProps) {
  const user = await requireAdmin("forms:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const page = Math.max(1, Number(params.page || 1) || 1);
  const statusFilter = normalizeStatusFilter(params.status);
  const formWhere = statusFilter === "all" ? { siteId: settings.siteId } : { siteId: settings.siteId, status: statusFilter.toUpperCase() as FormStatus };
  const submissionWhere = await getAccessibleFormSubmissionWhere(user, settings.siteId);
  const bookingTargetWhere = await getAccessibleBookingWhere(user, settings.siteId);
  const galleryTargetWhere = await getAccessibleGalleryWhere(user, settings.siteId);

  const [forms, formCount, activeCount, submissionCount, fieldCount, bookingTargets, orderTargets, galleryTargets] = await Promise.all([
  prisma.form.findMany({
    where: formWhere,
    include: {
      _count: { select: { fields: true, submissions: { where: submissionWhere } } }
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize
  }),
  prisma.form.count({ where: formWhere }),
  prisma.form.count({ where: { siteId: settings.siteId, status: FormStatus.ACTIVE } }),
  prisma.formSubmission.count({ where: submissionWhere }),
  prisma.formField.count({ where: { form: { siteId: settings.siteId } } }),
  prisma.booking.findMany({
    where: bookingTargetWhere,
    include: { service: { select: { name: true } } },
    orderBy: { startsAt: "desc" },
    take: 50
  }),
  prisma.order.findMany({
    where: { siteId: settings.siteId },
    orderBy: { updatedAt: "desc" },
    select: { customerEmail: true, customerName: true, id: true, orderNumber: true, updatedAt: true },
    take: 50
  }),
  prisma.portfolioGallery.findMany({
    where: galleryTargetWhere,
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true, title: true, updatedAt: true },
    take: 50
  })]
  );

  const selectedFormId = params.form || forms[0]?.id;
  const selectedForm = selectedFormId ?
  await prisma.form.findFirst({
    where: { id: selectedFormId, siteId: settings.siteId },
    include: {
      attachments: {
        include: { _count: { select: { submissions: true } } },
        orderBy: [{ targetType: "asc" }, { createdAt: "desc" }]
      },
      fields: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      submissions: {
        where: submissionWhere,
        include: {
          client: true,
          signatures: {
            include: { formField: { select: { label: true } } },
            orderBy: { signedAt: "asc" }
          }
        },
        orderBy: { createdAt: "desc" },
        take: 10
      }
    }
  }) :
  null;
  const formIdsForFunnel = Array.from(new Set([...forms.map((form) => form.id), selectedForm?.id].filter((id): id is string => Boolean(id))));
  const funnelRows = formIdsForFunnel.length ?
  await prisma.analyticsEvent.groupBy({
    by: ["relatedId", "eventName"],
    where: {
      siteId: settings.siteId,
      eventName: { in: [...formFunnelEventNames] },
      relatedId: { in: formIdsForFunnel },
      relatedType: "form"
    },
    _count: { _all: true }
  }) :
  [];
  const funnelByFormId = new Map<string, FormFunnelMetrics>();
  for (const row of funnelRows) {
    const metrics = funnelByFormId.get(row.relatedId) || emptyFunnelMetrics();
    if (row.eventName === formAnalyticsEvents.view) metrics.views += row._count._all;
    if (row.eventName === formAnalyticsEvents.start) metrics.starts += row._count._all;
    if (row.eventName === formAnalyticsEvents.submit) metrics.submits += row._count._all;
    funnelByFormId.set(row.relatedId, metrics);
  }
  const selectedFunnel = selectedForm ? funnelByFormId.get(selectedForm.id) || emptyFunnelMetrics() : null;
  const pageCount = Math.max(1, Math.ceil(formCount / pageSize));
  const savedMessage = params.saved ? "Form changes saved." : null;
  const errorMessage = params.error || null;
  const targetGroups = [
  {
    emptyLabel: "No recent bookings.",
    label: "Booking",
    targetType: FormAttachmentTargetType.BOOKING,
    targets: bookingTargets.map((booking) => ({
      id: booking.id,
      label: `${booking.customerName} - ${booking.service.name}`,
      meta: formatDateTime(booking.startsAt, settings.timezone)
    }))
  },
  {
    emptyLabel: "No recent orders.",
    label: "Order",
    targetType: FormAttachmentTargetType.ORDER,
    targets: orderTargets.map((order) => ({
      id: order.id,
      label: `${order.orderNumber} - ${order.customerName}`,
      meta: order.customerEmail
    }))
  },
  {
    emptyLabel: "No recent galleries.",
    label: "Gallery",
    targetType: FormAttachmentTargetType.GALLERY,
    targets: galleryTargets.map((gallery) => ({
      id: gallery.id,
      label: gallery.title,
      meta: `/galleries/${gallery.slug}`
    }))
  }];

  const targetLabelByKey = new Map(
    targetGroups.flatMap((group) =>
    group.targets.map((target) => [targetKey(group.targetType, target.id), `${group.label}: ${target.label}`] as const)
    )
  );

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Forms</p>
          <h1>Intake and public forms</h1>
          <p>Build lead, intake, inquiry, and attachment-ready forms with a submission inbox.</p>
        </div>
        {selectedForm ?
        <ButtonLink href={`/forms/${selectedForm.slug}`} variant="secondary">
            <FileText size={18} />
            Public form
          </ButtonLink> :
        null}
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <EqualGrid as="section" min="220px">
        <Card>
          <ClipboardList size={22} />
          <h3>{activeCount} active forms</h3>
          <p className="lead lead-compact">
            Available for public pages, inquiry flows, and intake links.
          </p>
        </Card>
        <Card>
          <Inbox size={22} />
          <h3>{submissionCount} submissions</h3>
          <p className="lead lead-compact">
            Captured across all active and archived forms.
          </p>
        </Card>
        <Card>
          <FileText size={22} />
          <h3>{fieldCount} fields</h3>
          <p className="lead lead-compact">
            Fields support text, email, choices, dates, checkboxes, signatures, and hidden metadata.
          </p>
        </Card>
      </EqualGrid>

      <Card as="section" bodyClassName="ui-stack">
        <div className="page-header flush-header">
          <div>
            <h2 className="section-title">Start from template</h2>
            <p>Clone a starter into a draft form, then customize fields, copy, and status before publishing.</p>
          </div>
        </div>
        <EqualGrid min="220px">
          {formTemplates.map((template) =>
          <form action={createFormFromTemplateAction} className="subpanel form-grid" key={template.key}>
              <input type="hidden" name="templateKey" value={template.key} />
              <div>
                <span className="ui-badge">{template.category}</span>
                <h3 className="ui-zero">{template.name}</h3>
                <p className="ui-zero">{template.description}</p>
              </div>
              <p className="ui-zero">
                {template.fields.length} fields · {enumLabel(template.destination)}
              </p>
              <Button type="submit" variant="secondary">
                <CopyPlus size={18} />
                Use template
              </Button>
            </form>
          )}
        </EqualGrid>
      </Card>

      <EqualGrid as="section">
        <Card action={createFormAction} as="form" minHeight="none" bodyClassName="form-grid">
          <h2 className="section-title">Create form</h2>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="form-name">Name</label>
              <input id="form-name" name="name" required />
            </div>
            <div className="ui-field">
              <label htmlFor="form-slug">Public URL slug</label>
              <input id="form-slug" name="slug" placeholder="contact-inquiry" />
            </div>
          </EqualGrid>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="form-status">Status</label>
              <select id="form-status" name="status" defaultValue={FormStatus.DRAFT}>
                {Object.values(FormStatus).map((status) =>
                <option key={status} value={status}>
                    {enumLabel(status)}
                  </option>
                )}
              </select>
            </div>
            <div className="ui-field">
              <label htmlFor="form-destination">Destination</label>
              <select id="form-destination" name="destination" defaultValue={FormDestination.INQUIRY}>
                {supportedDestinations.map((destination) =>
                <option key={destination} value={destination}>
                    {enumLabel(destination)}
                  </option>
                )}
              </select>
            </div>
          </EqualGrid>
          <div className="ui-field">
            <label htmlFor="form-description">Description</label>
            <textarea id="form-description" name="description" />
          </div>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="submitButtonLabel">Submit button</label>
              <input id="submitButtonLabel" name="submitButtonLabel" placeholder="Submit" />
            </div>
            <div className="ui-field">
              <label htmlFor="notificationEmail">Notify email</label>
              <input id="notificationEmail" name="notificationEmail" type="email" placeholder={settings.contactEmail} />
            </div>
          </EqualGrid>
          <div className="ui-field">
            <label htmlFor="successMessage">Success message</label>
            <input id="successMessage" name="successMessage" placeholder="Thanks. Your form was submitted." />
          </div>
          <label className="ui-zero">
            <input name="enableSteps" type="checkbox" />
            Use multi-step pages
          </label>
          <Button type="submit">
            <Plus size={18} />
            Create form
          </Button>
        </Card>

        <Card>
          <div className="page-header compact-header">
            <div>
              <h2 className="section-title">Form library</h2>
              <p>{formCount} matching forms</p>
            </div>
            <div className="ui-zero">
              {statusFilters.map((filter) =>
              <Link className={filter === statusFilter ? "ui-button" : "ui-button ui-button-secondary"} href={`/admin/modules/forms?status=${filter}`} key={filter}>
                  {filter}
                </Link>
              )}
            </div>
          </div>
          <Table>
            <thead>
              <tr>
                <th>Form</th>
                <th>Destination</th>
                <th>Funnel</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {forms.map((form) => {
                const funnel = funnelByFormId.get(form.id) || emptyFunnelMetrics();

                return (
                  <tr key={form.id}>
                    <td>
                      <strong>{form.name}</strong>
                      <br />
                      <span className="muted-text">
                        /forms/{form.slug} · {form._count.fields} fields · {form._count.submissions} submissions
                      </span>
                    </td>
                    <td>{enumLabel(form.destination)}</td>
                    <td>
                      <strong>{conversionRate(funnel)}</strong>
                      <br />
                      <span className="muted-text">
                        {funnel.views} views · {funnel.starts} starts · {funnel.submits} submits
                      </span>
                    </td>
                    <td>
                      <span className={statusClass(form.status)}>{enumLabel(form.status)}</span>
                    </td>
                    <td>
                      <div className="ui-zero">
                        <ButtonLink href={`/admin/modules/forms?status=${statusFilter}&form=${form.id}`} variant="secondary">
                          Edit
                        </ButtonLink>
                        <form action={updateFormStatusAction}>
                          <input type="hidden" name="id" value={form.id} />
                          <input type="hidden" name="status" value={form.status === FormStatus.ACTIVE ? FormStatus.DRAFT : FormStatus.ACTIVE} />
                          <Button type="submit" variant="secondary">
                            {form.status === FormStatus.ACTIVE ? "Draft" : "Activate"}
                          </Button>
                        </form>
                      </div>
                    </td>
                  </tr>);

              })}
              {!forms.length ?
              <tr>
                  <td colSpan={5}>No forms yet.</td>
                </tr> :
              null}
            </tbody>
          </Table>
          <div className="ui-zero">
            <ButtonLink href={`/admin/modules/forms?status=${statusFilter}&page=${Math.max(1, page - 1)}`} aria-disabled={page <= 1} variant="secondary">
              Previous
            </ButtonLink>
            <span className="ui-badge">
              Page {Math.min(page, pageCount)} of {pageCount}
            </span>
            <ButtonLink

              href={`/admin/modules/forms?status=${statusFilter}&page=${Math.min(pageCount, page + 1)}`}
              aria-disabled={page >= pageCount} variant="secondary">
              
              Next
            </ButtonLink>
          </div>
        </Card>
      </EqualGrid>

      {selectedForm ?
      <EqualGrid as="section">
          <Card action={updateFormAction} as="form" minHeight="none" bodyClassName="form-grid">
            <h2 className="section-title">Edit selected form</h2>
            <input type="hidden" name="id" value={selectedForm.id} />
            <EqualGrid>
              <div className="ui-field">
                <label htmlFor={`selected-${selectedForm.id}-name`}>Name</label>
                <input id={`selected-${selectedForm.id}-name`} name="name" defaultValue={selectedForm.name} required />
              </div>
              <div className="ui-field">
                <label htmlFor={`selected-${selectedForm.id}-slug`}>Public URL slug</label>
                <input id={`selected-${selectedForm.id}-slug`} name="slug" defaultValue={selectedForm.slug} />
              </div>
            </EqualGrid>
            <EqualGrid>
              <div className="ui-field">
                <label htmlFor={`selected-${selectedForm.id}-status`}>Status</label>
                <select id={`selected-${selectedForm.id}-status`} name="status" defaultValue={selectedForm.status}>
                  {Object.values(FormStatus).map((status) =>
                <option key={status} value={status}>
                      {enumLabel(status)}
                    </option>
                )}
                </select>
              </div>
              <div className="ui-field">
                <label htmlFor={`selected-${selectedForm.id}-destination`}>Destination</label>
                <select id={`selected-${selectedForm.id}-destination`} name="destination" defaultValue={selectedForm.destination}>
                  {destinationOptions(selectedForm.destination).map((destination) =>
                <option key={destination} value={destination}>
                      {enumLabel(destination)}
                    </option>
                )}
                </select>
              </div>
            </EqualGrid>
            <div className="ui-field">
              <label htmlFor={`selected-${selectedForm.id}-description`}>Description</label>
              <textarea id={`selected-${selectedForm.id}-description`} name="description" defaultValue={selectedForm.description} />
            </div>
            <EqualGrid>
              <div className="ui-field">
                <label htmlFor={`selected-${selectedForm.id}-button`}>Submit button</label>
                <input id={`selected-${selectedForm.id}-button`} name="submitButtonLabel" defaultValue={selectedForm.submitButtonLabel} />
              </div>
              <div className="ui-field">
                <label htmlFor={`selected-${selectedForm.id}-notify`}>Notify email</label>
                <input id={`selected-${selectedForm.id}-notify`} name="notificationEmail" type="email" defaultValue={selectedForm.notificationEmail || ""} />
              </div>
            </EqualGrid>
            <div className="ui-field">
              <label htmlFor={`selected-${selectedForm.id}-success`}>Success message</label>
              <input id={`selected-${selectedForm.id}-success`} name="successMessage" defaultValue={selectedForm.successMessage} />
            </div>
            <label className="ui-zero">
              <input name="enableSteps" type="checkbox" defaultChecked={selectedForm.enableSteps} />
              Use multi-step pages
            </label>
            <Button type="submit">
              Save form
            </Button>
          </Card>

          <Card bodyClassName="ui-stack">
            <h2 className="section-title">Form actions</h2>
            {selectedFunnel ?
          <div className="subpanel">
                <span className="ui-badge">Conversion {conversionRate(selectedFunnel)}</span>
                <h3 className="ui-zero">Submission funnel</h3>
                <p className="ui-zero">
                  {selectedFunnel.views} views · {selectedFunnel.starts} starts · {selectedFunnel.submits} submits
                </p>
              </div> :
          null}
            <form action={duplicateFormAction} className="subpanel form-grid">
              <input type="hidden" name="id" value={selectedForm.id} />
              <p className="ui-zero">Clone this form and its fields into a draft template you can edit safely.</p>
              <Button type="submit" variant="secondary">
                Duplicate form
              </Button>
            </form>
            <form action={updateFormStatusAction} className="subpanel form-grid">
              <input type="hidden" name="id" value={selectedForm.id} />
              <input type="hidden" name="status" value={FormStatus.ARCHIVED} />
              <p className="ui-zero">Archive hides the form from public use without deleting submissions.</p>
              <Button type="submit" variant="secondary">
                Archive form
              </Button>
            </form>
            <form action={deleteFormAction} className="subpanel form-grid">
              <input type="hidden" name="id" value={selectedForm.id} />
              <label className="ui-zero">
                <input name="confirmDelete" type="checkbox" required />
                Delete this form, its fields, and its submissions.
              </label>
              <Button type="submit" variant="danger">
                Delete form
              </Button>
            </form>
          </Card>

          <Card bodyClassName="ui-stack">
            <div>
              <h2 className="section-title">Attachments</h2>
              <p className="ui-zero">Attach this form to a booking, order, or gallery and mark it required when it blocks follow-up.</p>
            </div>
            <EqualGrid min="220px">
              {targetGroups.map((group) =>
            <form action={createFormAttachmentAction} className="subpanel form-grid" key={group.targetType}>
                  <input type="hidden" name="formId" value={selectedForm.id} />
                  <input type="hidden" name="targetType" value={group.targetType} />
                  <div className="ui-field">
                    <label htmlFor={`attachment-${selectedForm.id}-${group.targetType}`}>{group.label}</label>
                    <select
                  id={`attachment-${selectedForm.id}-${group.targetType}`}
                  name="targetId"
                  required
                  defaultValue={group.targets[0]?.id || ""}>
                  
                      {!group.targets.length ? <option value="">{group.emptyLabel}</option> : null}
                      {group.targets.map((target) =>
                  <option key={target.id} value={target.id}>
                          {target.label}
                        </option>
                  )}
                    </select>
                  </div>
                  {group.targets[0]?.meta ? <p className="ui-zero">{group.targets[0].meta}</p> : null}
                  <label className="ui-zero">
                    <input name="isRequired" type="checkbox" />
                    Required
                  </label>
                  <Button disabled={!group.targets.length} type="submit" variant="secondary">
                    <Paperclip size={16} />
                    Attach
                  </Button>
                </form>
            )}
            </EqualGrid>
            <Table>
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Rule</th>
                  <th>Submissions</th>
                  <th>Public link</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {selectedForm.attachments.map((attachment) =>
              <tr key={attachment.id}>
                    <td>
                      <strong>{targetLabelByKey.get(targetKey(attachment.targetType, attachment.targetId)) || enumLabel(attachment.targetType)}</strong>
                      <br />
                      <span className="muted-text">{attachment.targetId}</span>
                    </td>
                    <td>
                      <span className={attachment.isRequired ? "ui-badge ui-badge-success" : "ui-badge"}>{attachment.isRequired ? "required" : "optional"}</span>
                    </td>
                    <td>{attachment._count.submissions}</td>
                    <td>
                      <Link
                    href={publicFormAttachmentHref({
                      formSlug: selectedForm.slug,
                      targetId: attachment.targetId,
                      targetType: attachment.targetType
                    })}>
                    
                        Open form link
                      </Link>
                    </td>
                    <td>
                      <form action={deleteFormAttachmentAction}>
                        <input type="hidden" name="id" value={attachment.id} />
                        <input type="hidden" name="formId" value={selectedForm.id} />
                        <Button type="submit" aria-label={`Remove attachment ${attachment.id}`} variant="secondary">
                          <Trash2 size={16} />
                        </Button>
                      </form>
                    </td>
                  </tr>
              )}
                {!selectedForm.attachments.length ?
              <tr>
                    <td colSpan={5}>No attachments yet.</td>
                  </tr> :
              null}
              </tbody>
            </Table>
          </Card>

          <Card bodyClassName="ui-stack">
            <div>
              <h2 className="section-title">Fields for {selectedForm.name}</h2>
              <p className="ui-zero">Choice fields use comma-separated options. File fields store private uploads for gated admin download.</p>
            </div>
            <form action={createFormFieldAction} className="subpanel form-grid">
              <input type="hidden" name="formId" value={selectedForm.id} />
              <EqualGrid>
                <div className="ui-field">
                  <label htmlFor="field-label">Label</label>
                  <input id="field-label" name="label" required />
                </div>
                <div className="ui-field">
                  <label htmlFor="field-type">Type</label>
                  <select id="field-type" name="type" defaultValue={FormFieldType.TEXT}>
                    {Object.values(FormFieldType).map((type) =>
                  <option key={type} value={type}>
                        {enumLabel(type)}
                      </option>
                  )}
                  </select>
                </div>
              </EqualGrid>
              <div className="ui-field">
                <label htmlFor="field-role">Identity role</label>
                <select id="field-role" name="fieldRole" defaultValue={FormFieldRole.NONE}>
                  {Object.values(FormFieldRole).map((role) =>
                <option key={role} value={role}>
                      {enumLabel(role)}
                    </option>
                )}
                </select>
              </div>
              <EqualGrid>
                <div className="ui-field">
                  <label htmlFor="field-placeholder">Placeholder or hidden value</label>
                  <input id="field-placeholder" name="placeholder" />
                </div>
                <div className="ui-field">
                  <label htmlFor="field-options">Options</label>
                  <input id="field-options" name="options" placeholder="Email, Phone, Text" />
                </div>
              </EqualGrid>
              <EqualGrid min="220px">
                <div className="ui-field">
                  <label htmlFor="field-help">Help text</label>
                  <input id="field-help" name="helpText" />
                </div>
                <div className="ui-field">
                  <label htmlFor="field-page">Page</label>
                  <input id="field-page" name="pageNumber" type="number" min={1} defaultValue={1} />
                </div>
                <div className="ui-field">
                  <label htmlFor="field-sort">Sort order</label>
                  <input id="field-sort" name="sortOrder" type="number" defaultValue={selectedForm.fields.length * 10 + 10} />
                </div>
              </EqualGrid>
              <div className="ui-zero">
                <label className="ui-zero">
                  <input name="isRequired" type="checkbox" />
                  Required
                </label>
                <label className="ui-zero">
                  <input name="isHidden" type="checkbox" />
                  Hidden metadata
                </label>
              </div>
              {conditionalControls({ fields: selectedForm.fields, idPrefix: "field-new" })}
              {validationControls({ idPrefix: "field-new" })}
              {uploadControls({ idPrefix: "field-new" })}
              <Button type="submit" variant="secondary">
                Add field
              </Button>
            </form>
            <Table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Type</th>
                  <th>Options</th>
                  <th>Rules</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {selectedForm.fields.map((field) =>
              <tr key={field.id}>
                    <td>
                      <strong>{field.label}</strong>
                      <br />
                      <span className="muted-text">{field.helpText || field.placeholder || "No helper text"}</span>
                    </td>
                    <td>{enumLabel(field.type)}</td>
                    <td>{stringArrayCsv(field.options) || "None"}</td>
                    <td>
                      <span className="ui-badge">{field.isRequired ? "required" : "optional"}</span>{" "}
                      {field.isHidden ? <span className="ui-badge">hidden</span> : null}
                      {field.fieldRole !== FormFieldRole.NONE ? <span className="ui-badge">{enumLabel(field.fieldRole)}</span> : null}
                      <br />
                      <span className="muted-text">
                        Page {field.pageNumber} · Sort {field.sortOrder}
                      </span>
                      {conditionSummary(field, selectedForm.fields) ?
                  <>
                          <br />
                          <span className="muted-text">{conditionSummary(field, selectedForm.fields)}</span>
                        </> :
                  null}
                      {validationSummary(field) ?
                  <>
                          <br />
                          <span className="muted-text">{validationSummary(field)}</span>
                        </> :
                  null}
                      {uploadSummary(field) ?
                  <>
                          <br />
                          <span className="muted-text">{uploadSummary(field)}</span>
                        </> :
                  null}
                    </td>
                    <td>
                      <details>
                        <summary>Edit</summary>
                        <form action={updateFormFieldAction} className="form-grid ui-zero">
                          <input type="hidden" name="id" value={field.id} />
                          <input type="hidden" name="formId" value={selectedForm.id} />
                          <div className="ui-field">
                            <label htmlFor={`field-${field.id}-label`}>Label</label>
                            <input id={`field-${field.id}-label`} name="label" defaultValue={field.label} required />
                          </div>
                          <EqualGrid min="220px">
                            <div className="ui-field">
                              <label htmlFor={`field-${field.id}-type`}>Type</label>
                              <select id={`field-${field.id}-type`} name="type" defaultValue={field.type}>
                                {Object.values(FormFieldType).map((type) =>
                            <option key={type} value={type}>
                                    {enumLabel(type)}
                                  </option>
                            )}
                              </select>
                            </div>
                            <div className="ui-field">
                              <label htmlFor={`field-${field.id}-page`}>Page</label>
                              <input id={`field-${field.id}-page`} name="pageNumber" type="number" min={1} defaultValue={field.pageNumber} />
                            </div>
                            <div className="ui-field">
                              <label htmlFor={`field-${field.id}-sort`}>Sort order</label>
                              <input id={`field-${field.id}-sort`} name="sortOrder" type="number" defaultValue={field.sortOrder} />
                            </div>
                          </EqualGrid>
                          <div className="ui-field">
                            <label htmlFor={`field-${field.id}-role`}>Identity role</label>
                            <select id={`field-${field.id}-role`} name="fieldRole" defaultValue={field.fieldRole}>
                              {Object.values(FormFieldRole).map((role) =>
                          <option key={role} value={role}>
                                  {enumLabel(role)}
                                </option>
                          )}
                            </select>
                          </div>
                          <div className="ui-field">
                            <label htmlFor={`field-${field.id}-placeholder`}>Placeholder or hidden value</label>
                            <input id={`field-${field.id}-placeholder`} name="placeholder" defaultValue={field.placeholder} />
                          </div>
                          <div className="ui-field">
                            <label htmlFor={`field-${field.id}-options`}>Options</label>
                            <input id={`field-${field.id}-options`} name="options" defaultValue={stringArrayCsv(field.options)} />
                          </div>
                          <div className="ui-field">
                            <label htmlFor={`field-${field.id}-help`}>Help text</label>
                            <input id={`field-${field.id}-help`} name="helpText" defaultValue={field.helpText} />
                          </div>
                          <div className="ui-zero">
                            <label className="ui-zero">
                              <input name="isRequired" type="checkbox" defaultChecked={field.isRequired} />
                              Required
                            </label>
                            <label className="ui-zero">
                              <input name="isHidden" type="checkbox" defaultChecked={field.isHidden} />
                              Hidden metadata
                            </label>
                          </div>
                          {conditionalControls({ field, fields: selectedForm.fields, idPrefix: `field-${field.id}` })}
                          {validationControls({ field, idPrefix: `field-${field.id}` })}
                          {uploadControls({ field, idPrefix: `field-${field.id}` })}
                          <Button type="submit" variant="secondary">
                            Save field
                          </Button>
                        </form>
                        <form action={deleteFormFieldAction} className="form-grid ui-zero">
                          <input type="hidden" name="id" value={field.id} />
                          <input type="hidden" name="formId" value={selectedForm.id} />
                          <label className="ui-zero">
                            <input name="confirmDelete" type="checkbox" required />
                            Delete this field.
                          </label>
                          <Button type="submit" variant="danger">
                            Delete field
                          </Button>
                        </form>
                      </details>
                    </td>
                  </tr>
              )}
                {!selectedForm.fields.length ?
              <tr>
                    <td colSpan={5}>No fields yet.</td>
                  </tr> :
              null}
              </tbody>
            </Table>
          </Card>
        </EqualGrid> :
      null}

      {selectedForm ?
      <Card as="section">
          <div className="page-header compact-header">
            <div>
              <h2 className="section-title">Recent submissions</h2>
              <p>Newest responses for {selectedForm.name}.</p>
            </div>
            <div className="ui-zero">
              <ButtonLink href={`/admin/modules/forms/export?formId=${selectedForm.id}`} variant="secondary">
                Export CSV
              </ButtonLink>
              <ButtonLink href={`/forms/${selectedForm.slug}`} variant="secondary">
                Open public form
              </ButtonLink>
            </div>
          </div>
          <Table>
            <thead>
              <tr>
                <th>Submitter</th>
                <th>Response</th>
                <th>Client</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {selectedForm.submissions.map((submission) =>
            <tr key={submission.id}>
                  <td>
                    <strong>{submission.submitterName || "Anonymous"}</strong>
                    <br />
                    <span className="muted-text">{submission.submitterEmail || "No email"}</span>
                  </td>
                  <td>
                    {summarizeSubmission(submission.data)}
                    <details className="ui-zero">
                      <summary>View response</summary>
                      <div className="subpanel ui-zero">
                        {submissionEntries(submission.data).map((entry) =>
                    <div className="ui-zero" key={entry.id}>
                            <strong>{entry.label}</strong>{" "}
                            <span className="ui-badge">{entry.type.toLowerCase()}</span>
                            {entry.file ?
                      <p className="ui-zero">
                                <a href={`/admin/modules/forms/submissions/${submission.id}/files/${entry.file.assetId}`}>
                                  {entry.file.filename || entry.value || "Download file"}
                                </a>{" "}
                                {entry.file.mimeType ? <span className="ui-badge">{entry.file.mimeType}</span> : null}{" "}
                                {entry.file.sizeBytes ? <span>{formatUploadSize(entry.file.sizeBytes)}</span> : null}
                              </p> :

                      <p className="ui-zero">{entry.value || "No answer"}</p>
                      }
                          </div>
                    )}
                        {!submissionEntries(submission.data).length ? <p>No response data.</p> : null}
                        {submission.signatures.length ?
                    <div className="ui-zero">
                            <h4 className="ui-zero">Signatures</h4>
                            {submission.signatures.map((signature) =>
                      <div className="ui-zero" key={signature.id}>
                                <strong>{signature.formField.label}</strong>{" "}
                                <span className="ui-badge">{enumLabel(signature.captureType)}</span>
                                <p className="ui-zero">
                                  Signed by {signature.signerName}
                                  {signature.signerEmail ? ` (${signature.signerEmail})` : ""} on{" "}
                                  {formatDateTime(signature.signedAt, settings.timezone)}
                                </p>
                                {signature.captureType === "DRAWN" ?
                        <NextImage className="ui-zero"
                        alt={`Signature for ${signature.signerName}`}
                        height={120}
                        unoptimized
                        width={360}
                        src={signature.capturedSignature} /> :



                        <p className="ui-zero">
                                    {signature.capturedSignature}
                                  </p>
                        }
                                <small className="muted-text">{signature.consentStatement}</small>
                              </div>
                      )}
                          </div> :
                    null}
                        <p className="ui-zero">
                          Submission data stores field IDs with submission-time labels and field types.
                        </p>
                      </div>
                    </details>
                  </td>
                  <td>
                    {submission.client ?
                <Link href={`/admin/clients/${submission.client.id}`}>{submission.client.name}</Link> :

                <span className="muted-text">Not linked</span>
                }
                  </td>
                  <td>{formatDateTime(submission.createdAt, settings.timezone)}</td>
                </tr>
            )}
              {!selectedForm.submissions.length ?
            <tr>
                  <td colSpan={4}>No submissions yet.</td>
                </tr> :
            null}
            </tbody>
          </Table>
        </Card> :
      null}
    </div>);

}
