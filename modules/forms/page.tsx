import Link from "next/link";
import { FormDestination, FormFieldRole, FormFieldType, FormStatus } from "@prisma/client";
import { ClipboardList, FileText, Inbox, Plus } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import {
  createFormAction,
  createFormFieldAction,
  deleteFormAction,
  deleteFormFieldAction,
  duplicateFormAction,
  updateFormAction,
  updateFormFieldAction,
  updateFormStatusAction
} from "./actions";

export const dynamic = "force-dynamic";

const pageSize = 20;
const statusFilters = ["all", ...Object.values(FormStatus).map((status) => status.toLowerCase())] as const;
const supportedDestinations: FormDestination[] = [FormDestination.STANDALONE_LEAD, FormDestination.CLIENT, FormDestination.INQUIRY];

type FormsPageProps = {
  searchParams: Promise<{ saved?: string; error?: string; page?: string; status?: string; form?: string }>;
};

function enumLabel(value: string) {
  return value.toLowerCase().split("_").join(" ");
}

function normalizeStatusFilter(value?: string) {
  return statusFilters.includes(value as (typeof statusFilters)[number]) ? value || "all" : "all";
}

function statusClass(status: FormStatus) {
  if (status === FormStatus.ACTIVE) return "pill success";
  if (status === FormStatus.ARCHIVED) return "pill danger";
  return "pill";
}

function optionsToCsv(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join(", ") : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function summarizeSubmission(value: unknown) {
  if (!isRecord(value)) return "No response data";

  const entries = Object.entries(value)
    .map(([key, item]) => {
      if (isRecord(item) && "value" in item) {
        return [String(item.label || key), item.value] as const;
      }

      return [key, item] as const;
    })
    .filter(([, item]) => String(item || "").trim())
    .slice(0, 4);

  return entries.length ? entries.map(([key, item]) => `${key}: ${String(item)}`).join(" | ") : "No response data";
}

function destinationOptions(current?: FormDestination) {
  const options = [...supportedDestinations];
  if (current && !options.includes(current)) options.push(current);
  return options;
}

export default async function FormsPage({ searchParams }: FormsPageProps) {
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const page = Math.max(1, Number(params.page || 1) || 1);
  const statusFilter = normalizeStatusFilter(params.status);
  const formWhere = statusFilter === "all" ? {} : { status: statusFilter.toUpperCase() as FormStatus };

  const [forms, formCount, activeCount, submissionCount, fieldCount] = await Promise.all([
    prisma.form.findMany({
      where: formWhere,
      include: {
        _count: { select: { fields: true, submissions: true } }
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.form.count({ where: formWhere }),
    prisma.form.count({ where: { status: FormStatus.ACTIVE } }),
    prisma.formSubmission.count(),
    prisma.formField.count()
  ]);

  const selectedFormId = params.form || forms[0]?.id;
  const selectedForm = selectedFormId
    ? await prisma.form.findUnique({
        where: { id: selectedFormId },
        include: {
          fields: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
          submissions: {
            include: { client: true },
            orderBy: { createdAt: "desc" },
            take: 10
          }
        }
      })
    : null;
  const pageCount = Math.max(1, Math.ceil(formCount / pageSize));
  const savedMessage = params.saved ? "Form changes saved." : null;
  const errorMessage = params.error || null;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Forms</p>
          <h1 style={{ fontSize: "2.4rem" }}>Intake and public forms</h1>
          <p>Build lead, intake, inquiry, and attachment-ready forms with a submission inbox.</p>
        </div>
        {selectedForm ? (
          <Link className="button secondary" href={`/forms/${selectedForm.slug}`}>
            <FileText size={18} />
            Public form
          </Link>
        ) : null}
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <section className="grid-3">
        <div className="card">
          <ClipboardList size={22} />
          <h3>{activeCount} active forms</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Available for public pages, inquiry flows, and intake links.
          </p>
        </div>
        <div className="card">
          <Inbox size={22} />
          <h3>{submissionCount} submissions</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Captured across all active and archived forms.
          </p>
        </div>
        <div className="card">
          <FileText size={22} />
          <h3>{fieldCount} fields</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Fields support text, email, choices, dates, checkboxes, signatures, and hidden metadata.
          </p>
        </div>
      </section>

      <section className="grid-2">
        <form action={createFormAction} className="card form-grid">
          <h2 style={{ fontSize: "1.35rem" }}>Create form</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="form-name">Name</label>
              <input id="form-name" name="name" required />
            </div>
            <div className="field">
              <label htmlFor="form-slug">Public URL slug</label>
              <input id="form-slug" name="slug" placeholder="contact-inquiry" />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="form-status">Status</label>
              <select id="form-status" name="status" defaultValue={FormStatus.DRAFT}>
                {Object.values(FormStatus).map((status) => (
                  <option key={status} value={status}>
                    {enumLabel(status)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="form-destination">Destination</label>
              <select id="form-destination" name="destination" defaultValue={FormDestination.INQUIRY}>
                {supportedDestinations.map((destination) => (
                  <option key={destination} value={destination}>
                    {enumLabel(destination)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="form-description">Description</label>
            <textarea id="form-description" name="description" />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="submitButtonLabel">Submit button</label>
              <input id="submitButtonLabel" name="submitButtonLabel" placeholder="Submit" />
            </div>
            <div className="field">
              <label htmlFor="notificationEmail">Notify email</label>
              <input id="notificationEmail" name="notificationEmail" type="email" placeholder={settings.contactEmail} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="successMessage">Success message</label>
            <input id="successMessage" name="successMessage" placeholder="Thanks. Your form was submitted." />
          </div>
          <button className="button" type="submit">
            <Plus size={18} />
            Create form
          </button>
        </form>

        <div className="card">
          <div className="page-header" style={{ marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: "1.35rem" }}>Form library</h2>
              <p>{formCount} matching forms</p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {statusFilters.map((filter) => (
                <Link className={filter === statusFilter ? "button" : "button secondary"} href={`/admin/modules/forms?status=${filter}`} key={filter}>
                  {filter}
                </Link>
              ))}
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Form</th>
                <th>Destination</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {forms.map((form) => (
                <tr key={form.id}>
                  <td>
                    <strong>{form.name}</strong>
                    <br />
                    <span style={{ color: "var(--muted)" }}>
                      /forms/{form.slug} · {form._count.fields} fields · {form._count.submissions} submissions
                    </span>
                  </td>
                  <td>{enumLabel(form.destination)}</td>
                  <td>
                    <span className={statusClass(form.status)}>{enumLabel(form.status)}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <Link className="button secondary" href={`/admin/modules/forms?status=${statusFilter}&form=${form.id}`}>
                        Edit
                      </Link>
                      <form action={updateFormStatusAction}>
                        <input type="hidden" name="id" value={form.id} />
                        <input type="hidden" name="status" value={form.status === FormStatus.ACTIVE ? FormStatus.DRAFT : FormStatus.ACTIVE} />
                        <button className="button secondary" type="submit">
                          {form.status === FormStatus.ACTIVE ? "Draft" : "Activate"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {!forms.length ? (
                <tr>
                  <td colSpan={4}>No forms yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <Link className="button secondary" href={`/admin/modules/forms?status=${statusFilter}&page=${Math.max(1, page - 1)}`} aria-disabled={page <= 1}>
              Previous
            </Link>
            <span className="pill">
              Page {Math.min(page, pageCount)} of {pageCount}
            </span>
            <Link
              className="button secondary"
              href={`/admin/modules/forms?status=${statusFilter}&page=${Math.min(pageCount, page + 1)}`}
              aria-disabled={page >= pageCount}
            >
              Next
            </Link>
          </div>
        </div>
      </section>

      {selectedForm ? (
        <section className="grid-2">
          <form action={updateFormAction} className="card form-grid">
            <h2 style={{ fontSize: "1.35rem" }}>Edit selected form</h2>
            <input type="hidden" name="id" value={selectedForm.id} />
            <div className="grid-2">
              <div className="field">
                <label htmlFor={`selected-${selectedForm.id}-name`}>Name</label>
                <input id={`selected-${selectedForm.id}-name`} name="name" defaultValue={selectedForm.name} required />
              </div>
              <div className="field">
                <label htmlFor={`selected-${selectedForm.id}-slug`}>Public URL slug</label>
                <input id={`selected-${selectedForm.id}-slug`} name="slug" defaultValue={selectedForm.slug} />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor={`selected-${selectedForm.id}-status`}>Status</label>
                <select id={`selected-${selectedForm.id}-status`} name="status" defaultValue={selectedForm.status}>
                  {Object.values(FormStatus).map((status) => (
                    <option key={status} value={status}>
                      {enumLabel(status)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`selected-${selectedForm.id}-destination`}>Destination</label>
                <select id={`selected-${selectedForm.id}-destination`} name="destination" defaultValue={selectedForm.destination}>
                  {destinationOptions(selectedForm.destination).map((destination) => (
                    <option key={destination} value={destination}>
                      {enumLabel(destination)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor={`selected-${selectedForm.id}-description`}>Description</label>
              <textarea id={`selected-${selectedForm.id}-description`} name="description" defaultValue={selectedForm.description} />
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor={`selected-${selectedForm.id}-button`}>Submit button</label>
                <input id={`selected-${selectedForm.id}-button`} name="submitButtonLabel" defaultValue={selectedForm.submitButtonLabel} />
              </div>
              <div className="field">
                <label htmlFor={`selected-${selectedForm.id}-notify`}>Notify email</label>
                <input id={`selected-${selectedForm.id}-notify`} name="notificationEmail" type="email" defaultValue={selectedForm.notificationEmail || ""} />
              </div>
            </div>
            <div className="field">
              <label htmlFor={`selected-${selectedForm.id}-success`}>Success message</label>
              <input id={`selected-${selectedForm.id}-success`} name="successMessage" defaultValue={selectedForm.successMessage} />
            </div>
            <button className="button" type="submit">
              Save form
            </button>
          </form>

          <div className="card stack">
            <h2 style={{ fontSize: "1.35rem" }}>Form actions</h2>
            <form action={duplicateFormAction} className="subpanel form-grid">
              <input type="hidden" name="id" value={selectedForm.id} />
              <p style={{ color: "var(--muted)", margin: 0 }}>Clone this form and its fields into a draft template you can edit safely.</p>
              <button className="button secondary" type="submit">
                Duplicate form
              </button>
            </form>
            <form action={updateFormStatusAction} className="subpanel form-grid">
              <input type="hidden" name="id" value={selectedForm.id} />
              <input type="hidden" name="status" value={FormStatus.ARCHIVED} />
              <p style={{ color: "var(--muted)", margin: 0 }}>Archive hides the form from public use without deleting submissions.</p>
              <button className="button secondary" type="submit">
                Archive form
              </button>
            </form>
            <form action={deleteFormAction} className="subpanel form-grid">
              <input type="hidden" name="id" value={selectedForm.id} />
              <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                <input name="confirmDelete" type="checkbox" required />
                Delete this form, its fields, and its submissions.
              </label>
              <button className="button danger" type="submit">
                Delete form
              </button>
            </form>
          </div>

          <div className="card stack">
            <div>
              <h2 style={{ fontSize: "1.35rem" }}>Fields for {selectedForm.name}</h2>
              <p style={{ color: "var(--muted)" }}>Choice fields use comma-separated options. Hidden fields store their placeholder as metadata.</p>
            </div>
            <form action={createFormFieldAction} className="subpanel form-grid">
              <input type="hidden" name="formId" value={selectedForm.id} />
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="field-label">Label</label>
                  <input id="field-label" name="label" required />
                </div>
                <div className="field">
                  <label htmlFor="field-type">Type</label>
                  <select id="field-type" name="type" defaultValue={FormFieldType.TEXT}>
                    {Object.values(FormFieldType).map((type) => (
                      <option key={type} value={type}>
                        {enumLabel(type)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="field-role">Identity role</label>
                <select id="field-role" name="fieldRole" defaultValue={FormFieldRole.NONE}>
                  {Object.values(FormFieldRole).map((role) => (
                    <option key={role} value={role}>
                      {enumLabel(role)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="field-placeholder">Placeholder or hidden value</label>
                  <input id="field-placeholder" name="placeholder" />
                </div>
                <div className="field">
                  <label htmlFor="field-options">Options</label>
                  <input id="field-options" name="options" placeholder="Email, Phone, Text" />
                </div>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="field-help">Help text</label>
                  <input id="field-help" name="helpText" />
                </div>
                <div className="field">
                  <label htmlFor="field-sort">Sort order</label>
                  <input id="field-sort" name="sortOrder" type="number" defaultValue={selectedForm.fields.length * 10 + 10} />
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                  <input name="isRequired" type="checkbox" />
                  Required
                </label>
                <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                  <input name="isHidden" type="checkbox" />
                  Hidden metadata
                </label>
              </div>
              <button className="button secondary" type="submit">
                Add field
              </button>
            </form>
            <table className="table">
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
                {selectedForm.fields.map((field) => (
                  <tr key={field.id}>
                    <td>
                      <strong>{field.label}</strong>
                      <br />
                      <span style={{ color: "var(--muted)" }}>{field.helpText || field.placeholder || "No helper text"}</span>
                    </td>
                    <td>{enumLabel(field.type)}</td>
                    <td>{optionsToCsv(field.options) || "None"}</td>
                    <td>
                      <span className="pill">{field.isRequired ? "required" : "optional"}</span>{" "}
                      {field.isHidden ? <span className="pill">hidden</span> : null}
                      {field.fieldRole !== FormFieldRole.NONE ? <span className="pill">{enumLabel(field.fieldRole)}</span> : null}
                      <br />
                      <span style={{ color: "var(--muted)" }}>Sort {field.sortOrder}</span>
                    </td>
                    <td>
                      <details>
                        <summary>Edit</summary>
                        <form action={updateFormFieldAction} className="form-grid" style={{ marginTop: 12, minWidth: 280 }}>
                          <input type="hidden" name="id" value={field.id} />
                          <input type="hidden" name="formId" value={selectedForm.id} />
                          <div className="field">
                            <label htmlFor={`field-${field.id}-label`}>Label</label>
                            <input id={`field-${field.id}-label`} name="label" defaultValue={field.label} required />
                          </div>
                          <div className="grid-2">
                            <div className="field">
                              <label htmlFor={`field-${field.id}-type`}>Type</label>
                              <select id={`field-${field.id}-type`} name="type" defaultValue={field.type}>
                                {Object.values(FormFieldType).map((type) => (
                                  <option key={type} value={type}>
                                    {enumLabel(type)}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="field">
                              <label htmlFor={`field-${field.id}-sort`}>Sort order</label>
                              <input id={`field-${field.id}-sort`} name="sortOrder" type="number" defaultValue={field.sortOrder} />
                            </div>
                          </div>
                          <div className="field">
                            <label htmlFor={`field-${field.id}-role`}>Identity role</label>
                            <select id={`field-${field.id}-role`} name="fieldRole" defaultValue={field.fieldRole}>
                              {Object.values(FormFieldRole).map((role) => (
                                <option key={role} value={role}>
                                  {enumLabel(role)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="field">
                            <label htmlFor={`field-${field.id}-placeholder`}>Placeholder or hidden value</label>
                            <input id={`field-${field.id}-placeholder`} name="placeholder" defaultValue={field.placeholder} />
                          </div>
                          <div className="field">
                            <label htmlFor={`field-${field.id}-options`}>Options</label>
                            <input id={`field-${field.id}-options`} name="options" defaultValue={optionsToCsv(field.options)} />
                          </div>
                          <div className="field">
                            <label htmlFor={`field-${field.id}-help`}>Help text</label>
                            <input id={`field-${field.id}-help`} name="helpText" defaultValue={field.helpText} />
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                            <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                              <input name="isRequired" type="checkbox" defaultChecked={field.isRequired} />
                              Required
                            </label>
                            <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                              <input name="isHidden" type="checkbox" defaultChecked={field.isHidden} />
                              Hidden metadata
                            </label>
                          </div>
                          <button className="button secondary" type="submit">
                            Save field
                          </button>
                        </form>
                        <form action={deleteFormFieldAction} className="form-grid" style={{ marginTop: 12, minWidth: 280 }}>
                          <input type="hidden" name="id" value={field.id} />
                          <input type="hidden" name="formId" value={selectedForm.id} />
                          <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                            <input name="confirmDelete" type="checkbox" required />
                            Delete this field.
                          </label>
                          <button className="button danger" type="submit">
                            Delete field
                          </button>
                        </form>
                      </details>
                    </td>
                  </tr>
                ))}
                {!selectedForm.fields.length ? (
                  <tr>
                    <td colSpan={5}>No fields yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {selectedForm ? (
        <section className="card">
          <div className="page-header" style={{ marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: "1.35rem" }}>Recent submissions</h2>
              <p>Newest responses for {selectedForm.name}.</p>
            </div>
            <Link className="button secondary" href={`/forms/${selectedForm.slug}`}>
              Open public form
            </Link>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Submitter</th>
                <th>Response</th>
                <th>Client</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {selectedForm.submissions.map((submission) => (
                <tr key={submission.id}>
                  <td>
                    <strong>{submission.submitterName || "Anonymous"}</strong>
                    <br />
                    <span style={{ color: "var(--muted)" }}>{submission.submitterEmail || "No email"}</span>
                  </td>
                  <td>{summarizeSubmission(submission.data)}</td>
                  <td>
                    {submission.client ? (
                      <Link href={`/admin/clients/${submission.client.id}`}>{submission.client.name}</Link>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>Not linked</span>
                    )}
                  </td>
                  <td>{formatDateTime(submission.createdAt, settings.timezone)}</td>
                </tr>
              ))}
              {!selectedForm.submissions.length ? (
                <tr>
                  <td colSpan={4}>No submissions yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
