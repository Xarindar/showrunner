import {
  EmailOutboxStatus,
  EmailSendingDomainStatus,
  EmailSuppressionScope,
  MessageChannel,
  MessageLogStatus,
  MessageTemplatePurpose
} from "@prisma/client";
import { Copy, Mail, MessageSquareText, Plus, RotateCcw, Save, ShieldOff } from "lucide-react";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { hasBuilderJson, renderEmailTemplate } from "@/lib/email/render";
import { enumLabel, formatDateTime, stringArrayCsv, stringArrayFromUnknown } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import {
  cloneMessageTemplateAction,
  createMessageTemplateAction,
  createSuppressionEntryAction,
  deleteSuppressionEntryAction,
  recordMessageLogAction,
  resendEmailOutboxAction,
  restoreMessageTemplateVersionAction,
  sendTemplateTestEmailAction,
  updateMessageTemplateBuilderAction,
  updateMessageTemplateStatusAction
} from "./actions";
import { EmailTemplateBuilder } from "./components/email-template-builder";

export const dynamic = "force-dynamic";

type CommunicationsPageProps = {
  searchParams: Promise<{ saved?: string; error?: string; previewTemplate?: string; sampleEvent?: string; tokensJson?: string }>;
};

function defaultSampleEventFor(purpose?: MessageTemplatePurpose) {
  if (purpose === MessageTemplatePurpose.ORDER_RECEIPT) return "order";
  if (purpose === MessageTemplatePurpose.INVOICE_NOTICE) return "invoice";
  if (purpose === MessageTemplatePurpose.FORM_SUBMISSION) return "form";
  if (purpose === MessageTemplatePurpose.GALLERY_ACCESS) return "gallery";
  if (purpose === MessageTemplatePurpose.BOOKING_CONFIRMATION || purpose === MessageTemplatePurpose.BOOKING_REMINDER) return "booking";
  return "general";
}

function sampleTokensFor(
  template: { purpose?: MessageTemplatePurpose; requiredTokens: unknown; optionalTokens: unknown; tokens: unknown } | null,
  sampleEvent: string
) {
  const tokenNames = [
    ...new Set([
      ...stringArrayFromUnknown(template?.requiredTokens),
      ...stringArrayFromUnknown(template?.optionalTokens),
      ...stringArrayFromUnknown(template?.tokens)
    ])
  ];
  const presets: Record<string, Record<string, string>> = {
    booking: {
      appointmentTime: "Tuesday, June 16 at 10:00 AM",
      bookingDate: "June 16, 2026",
      bookingTime: "10:00 AM",
      businessName: "Willow Studio",
      customerEmail: "client@example.com",
      customerName: "Jordan Lee",
      serviceName: "Portrait session"
    },
    order: {
      businessName: "Willow Studio",
      customerEmail: "client@example.com",
      customerName: "Jordan Lee",
      orderNumber: "ORD-1042",
      orderUrl: "https://example.com/orders/ORD-1042",
      total: "$125.00"
    },
    invoice: {
      businessName: "Willow Studio",
      customerEmail: "client@example.com",
      customerName: "Jordan Lee",
      invoiceNumber: "INV-2048",
      invoiceUrl: "https://example.com/billing/sample",
      total: "$425.00"
    },
    form: {
      businessName: "Willow Studio",
      customerEmail: "client@example.com",
      customerName: "Jordan Lee",
      formName: "Wedding inquiry",
      submissionUrl: "https://example.com/admin/forms/submissions/sample"
    },
    gallery: {
      businessName: "Willow Studio",
      customerEmail: "client@example.com",
      customerName: "Jordan Lee",
      galleryName: "Engagement proofs",
      galleryUrl: "https://example.com/galleries/sample"
    },
    general: {
      businessName: "Willow Studio",
      customerEmail: "client@example.com",
      customerName: "Jordan Lee",
      reviewUrl: "https://example.com/testimonials"
    }
  };
  const selectedPreset = presets[sampleEvent] || presets[defaultSampleEventFor(template?.purpose)];

  return Object.fromEntries(
    tokenNames.map((token) => {
      if (selectedPreset[token]) return [token, selectedPreset[token]];
      if (token.toLowerCase().includes("url")) return [token, "https://example.com"];
      if (token.toLowerCase().includes("total")) return [token, "$125.00"];
      if (token.toLowerCase().includes("email")) return [token, "client@example.com"];
      return [token, `Sample ${token}`];
    })
  );
}

function parsePreviewTokens(value: string) {
  if (!value.trim()) return {};

  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Token JSON must be an object.");
  }

  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, string | number | null] => {
      const value = entry[1];
      return typeof value === "string" || typeof value === "number" || value === null;
    })
  );
}

function logStatusClass(status: MessageLogStatus) {
  if (status === MessageLogStatus.SENT) return "pill success";
  if (status === MessageLogStatus.FAILED || status === MessageLogStatus.SUPPRESSED) return "pill danger";
  return "pill";
}

function outboxStatusClass(status: EmailOutboxStatus) {
  if (status === EmailOutboxStatus.SENT) return "pill success";
  if (status === EmailOutboxStatus.FAILED || status === EmailOutboxStatus.SUPPRESSED || status === EmailOutboxStatus.CANCELED) return "pill danger";
  return "pill";
}

function canResendStatus(status: EmailOutboxStatus) {
  return status !== EmailOutboxStatus.QUEUED && status !== EmailOutboxStatus.SENDING;
}

function relatedRecordHref(type: string, id: string) {
  if (!type || !id) return "";
  if (type === "booking") return `/admin/appointments/${id}`;
  if (type === "order") return `/admin/modules/products?order=${encodeURIComponent(id)}`;
  if (type === "billingDocument") return `/admin/modules/billing?document=${encodeURIComponent(id)}`;
  return "";
}

export default async function CommunicationsPage({ searchParams }: CommunicationsPageProps) {
  await requireAdmin("communications:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const [
    templates,
    senderIdentities,
    outboxRows,
    manualLogs,
    suppressions,
    templateVersions,
    activeTemplateCount,
    sentCount,
    suppressedCount
  ] = await Promise.all([
    prisma.messageTemplate.findMany({
      where: { siteId: settings.siteId },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      take: 30
    }),
    prisma.emailSenderIdentity.findMany({
      where: { siteId: settings.siteId },
      include: {
        sendingDomain: {
          select: { status: true }
        }
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
    }),
    prisma.emailOutbox.findMany({
      where: { siteId: settings.siteId },
      include: {
        providerEvents: {
          orderBy: { createdAt: "desc" },
          take: 3
        },
        template: true
      },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.messageLog.findMany({
      where: { siteId: settings.siteId },
      include: { template: true },
      orderBy: { createdAt: "desc" },
      take: 8
    }),
    prisma.suppressionListEntry.findMany({
      where: { siteId: settings.siteId },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.messageTemplateVersion.findMany({
      where: { siteId: settings.siteId },
      orderBy: [{ templateId: "asc" }, { version: "desc" }],
      take: 100
    }),
    prisma.messageTemplate.count({ where: { siteId: settings.siteId, isActive: true } }),
    prisma.emailOutbox.count({ where: { siteId: settings.siteId, status: EmailOutboxStatus.SENT } }),
    prisma.suppressionListEntry.count({ where: { siteId: settings.siteId } })
  ]);

  const verifiedSenderIdentities = senderIdentities.filter(
    (sender) => sender.isVerified && (!sender.sendingDomain || sender.sendingDomain.status === EmailSendingDomainStatus.VERIFIED)
  );
  const savedMessage = params.saved ? "Communications changes saved." : null;
  const errorMessage = params.error || null;
  const previewTemplate = templates.find((template) => template.id === params.previewTemplate) || templates[0] || null;
  const selectedSampleEvent = params.sampleEvent || defaultSampleEventFor(previewTemplate?.purpose);
  const previewTokensText =
    params.tokensJson || (previewTemplate ? JSON.stringify(sampleTokensFor(previewTemplate, selectedSampleEvent), null, 2) : "{}");
  const preview = previewTemplate
    ? await (async () => {
        try {
          return { rendered: await renderEmailTemplate(previewTemplate, parsePreviewTokens(previewTokensText)), error: "" };
        } catch (error) {
          return { rendered: null, error: error instanceof Error ? error.message : "Could not render preview." };
        }
      })()
    : null;
  const emailTemplates = templates.filter((template) => template.channel === MessageChannel.EMAIL);
  const versionsByTemplateId = new Map<string, typeof templateVersions>();
  for (const version of templateVersions) {
    versionsByTemplateId.set(version.templateId, [...(versionsByTemplateId.get(version.templateId) || []), version]);
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Communications</p>
          <h1 style={{ fontSize: "2.4rem" }}>Messages and delivery records</h1>
          <p>Email templates, manual delivery logs, and suppression controls for transactional and marketing guardrails.</p>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <section className="grid-3">
        <div className="card">
          <Mail size={22} />
          <h3>{activeTemplateCount} active templates</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Ready for booking, order, invoice, form, and admin notification flows.
          </p>
        </div>
        <div className="card">
          <MessageSquareText size={22} />
          <h3>{sentCount} sent emails</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Actual outbox rows marked sent by the email processor.
          </p>
        </div>
        <div className="card">
          <ShieldOff size={22} />
          <h3>{suppressedCount} suppressed</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Contacts that should not receive marketing or nonessential messages.
          </p>
        </div>
      </section>

      <section className="grid-2">
        <div className="card stack">
          <h2 style={{ fontSize: "1.35rem" }}>Visual email builder</h2>
          <p>
            The single editor for every email — booking, order, invoice, form, and admin notifications. Build the HTML from structured blocks
            while keeping a required text fallback, with version history per template.
          </p>
          {emailTemplates.map((template, index) => {
            const requiredTokens = stringArrayFromUnknown(template.requiredTokens);
            const availableTokens = [
              ...new Set([...requiredTokens, ...stringArrayFromUnknown(template.optionalTokens), ...stringArrayFromUnknown(template.tokens)])
            ];

            return (
              <details className="subpanel" key={template.id} open={index === 0}>
                <summary style={{ alignItems: "center", cursor: "pointer", display: "flex", gap: 12, justifyContent: "space-between" }}>
                  <span>
                    <strong>{template.name}</strong>
                    <br />
                    <small style={{ color: "var(--muted)" }}>{template.key || enumLabel(template.purpose)}</small>
                  </span>
                  <span className={hasBuilderJson(template.builderJson) ? "pill success" : "pill"}>
                    {hasBuilderJson(template.builderJson) ? "builder" : "text"}
                  </span>
                </summary>
                <form action={updateMessageTemplateBuilderAction} className="form-grid" style={{ marginTop: 16 }}>
                  <input type="hidden" name="id" value={template.id} />
                  <div className="field">
                    <label htmlFor={`builder-template-sender-${template.id}`}>Sender</label>
                    <select id={`builder-template-sender-${template.id}`} name="senderIdentityId" defaultValue={template.senderIdentityId || ""}>
                      <option value="">Default sender</option>
                      {verifiedSenderIdentities.map((sender) => (
                        <option key={sender.id} value={sender.id}>
                          {sender.name} &lt;{sender.fromEmail}&gt;
                        </option>
                      ))}
                    </select>
                  </div>
                  <EmailTemplateBuilder
                    availableTokens={availableTokens}
                    builderJson={template.builderJson}
                    idPrefix={`builder-${template.id}`}
                    previewText={template.previewText}
                    requiredTokens={requiredTokens}
                    subject={template.subject}
                    textBody={template.textBody || template.body}
                  />
                  <button className="button" type="submit">
                    <Save size={18} />
                    Save visual template
                  </button>
                </form>
                <div className="subpanel stack" style={{ marginTop: 16 }}>
                  <h3 style={{ fontSize: "1.05rem" }}>Version history</h3>
                  {(versionsByTemplateId.get(template.id) || []).slice(0, 5).map((version) => (
                    <form action={restoreMessageTemplateVersionAction} className="grid-2" key={version.id}>
                      <input type="hidden" name="templateId" value={template.id} />
                      <input type="hidden" name="versionId" value={version.id} />
                      <div>
                        <strong>Version {version.version}</strong>
                        <br />
                        <small style={{ color: "var(--muted)" }}>
                          {formatDateTime(version.createdAt, settings.timezone)} {version.note ? `- ${version.note}` : ""}
                        </small>
                      </div>
                      <div style={{ alignItems: "center", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                          <input name="confirmRestore" type="checkbox" required />
                          Restore
                        </label>
                        <button className="button secondary" type="submit">
                          <RotateCcw size={16} />
                          Restore version
                        </button>
                      </div>
                    </form>
                  ))}
                  {!(versionsByTemplateId.get(template.id) || []).length ? (
                    <small style={{ color: "var(--muted)" }}>Versions appear after the first save.</small>
                  ) : null}
                </div>
              </details>
            );
          })}
          {!emailTemplates.length ? <div className="subpanel">No email templates found.</div> : null}
        </div>

        <form action={createMessageTemplateAction} className="card form-grid">
          <h2 style={{ fontSize: "1.35rem" }}>Create manual template</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="template-name">Name</label>
              <input id="template-name" name="name" required />
            </div>
            <div className="field">
              <label htmlFor="template-purpose">Purpose</label>
              <select id="template-purpose" name="purpose" defaultValue={MessageTemplatePurpose.BOOKING_CONFIRMATION}>
                {Object.values(MessageTemplatePurpose).map((purpose) => (
                  <option key={purpose} value={purpose}>
                    {enumLabel(purpose)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="template-channel">Channel</label>
              <select id="template-channel" name="channel" defaultValue={MessageChannel.EMAIL}>
                {Object.values(MessageChannel).map((channel) => (
                  <option key={channel} value={channel}>
                    {enumLabel(channel)}
                  </option>
                ))}
              </select>
            </div>
            <label style={{ alignItems: "center", display: "flex", gap: 8, paddingTop: 27 }}>
              <input name="isActive" type="checkbox" defaultChecked />
              Active
            </label>
          </div>
          <div className="field">
            <label htmlFor="template-subject">Subject</label>
            <input id="template-subject" name="subject" placeholder="{{businessName}} appointment request" />
          </div>
          <div className="field">
            <label htmlFor="template-body">Body</label>
            <textarea id="template-body" name="body" required />
          </div>
          <div className="field">
            <label htmlFor="template-tokens">Allowed tokens</label>
            <input id="template-tokens" name="tokens" placeholder="businessName, customerName, appointmentTime" />
          </div>
          <button className="button" type="submit">
            <Plus size={18} />
            Add manual template
          </button>
        </form>

        <div className="card stack">
          <h2 style={{ fontSize: "1.35rem" }}>Template library</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Template</th>
                <th>Purpose</th>
                <th>State</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id}>
                  <td>
                    <strong>{template.name}</strong>
                    <br />
                    <span style={{ color: "var(--muted)" }}>
                      {template.key ? `System key: ${template.key}` : stringArrayCsv(template.tokens) || "No token allowlist"}
                    </span>
                  </td>
                  <td>
                    {enumLabel(template.purpose)}
                    <br />
                    <span style={{ color: "var(--muted)" }}>{enumLabel(template.channel)}</span>
                  </td>
                  <td>
                    <span className={template.isActive ? "pill success" : "pill danger"}>{template.isActive ? "active" : "inactive"}</span>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {template.key ? (
                        <span className="pill">Status locked</span>
                      ) : (
                        <form action={updateMessageTemplateStatusAction}>
                          <input type="hidden" name="id" value={template.id} />
                          <input type="hidden" name="isActive" value={template.isActive ? "false" : "true"} />
                          <button className="button secondary" type="submit">
                            {template.isActive ? "Pause" : "Activate"}
                          </button>
                        </form>
                      )}
                      <form action={cloneMessageTemplateAction}>
                        <input type="hidden" name="sourceTemplateId" value={template.id} />
                        <input type="hidden" name="name" value={`Copy of ${template.name}`} />
                        <button className="button secondary" type="submit">
                          <Copy size={16} />
                          Clone
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {!templates.length ? (
                <tr>
                  <td colSpan={4}>No templates yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid-2">
        <form action="/admin/modules/communications" method="get" className="card form-grid">
          <h2 style={{ fontSize: "1.35rem" }}>Preview template</h2>
          <div className="field">
            <label htmlFor="preview-template">Template</label>
            <select id="preview-template" name="previewTemplate" defaultValue={previewTemplate?.id || ""}>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="preview-sample-event">Sample event data</label>
            <select id="preview-sample-event" name="sampleEvent" defaultValue={selectedSampleEvent}>
              {["booking", "order", "invoice", "form", "gallery", "general"].map((event) => (
                <option key={event} value={event}>
                  {event}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="preview-tokens">Token JSON</label>
            <textarea id="preview-tokens" name="tokensJson" defaultValue={previewTokensText} />
          </div>
          <button className="button secondary" type="submit">
            Render preview
          </button>
        </form>

        <div className="card stack">
          <h2 style={{ fontSize: "1.35rem" }}>Rendered email</h2>
          {preview?.error ? <div className="error">{preview.error}</div> : null}
          {preview?.rendered ? (
            <div className="subpanel stack">
              <div>
                <p style={{ color: "var(--muted)", marginBottom: 8 }}>Subject</p>
                <strong>{preview.rendered.subject || "No subject"}</strong>
              </div>
              <div>
                <p style={{ color: "var(--muted)", marginBottom: 8 }}>Preview text</p>
                <p>{preview.rendered.previewText || "No preview text"}</p>
              </div>
              <div>
                <p style={{ color: "var(--muted)", marginBottom: 8 }}>Text body</p>
                <pre style={{ overflow: "auto", whiteSpace: "pre-wrap" }}>{preview.rendered.textBody}</pre>
              </div>
              <div>
                <p style={{ color: "var(--muted)", marginBottom: 8 }}>HTML preview</p>
                <iframe
                  sandbox=""
                  srcDoc={preview.rendered.htmlBody}
                  style={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 8, minHeight: 360, width: "100%" }}
                  title="Rendered email HTML preview"
                />
              </div>
            </div>
          ) : null}
          {previewTemplate ? (
            <form action={sendTemplateTestEmailAction} className="subpanel form-grid">
              <input type="hidden" name="templateId" value={previewTemplate.id} />
              <input type="hidden" name="tokensJson" value={previewTokensText} />
              <div className="field">
                <label htmlFor="test-recipient">Test recipient</label>
                <input id="test-recipient" name="recipientEmail" type="email" defaultValue={settings.contactEmail} required />
              </div>
              <button className="button secondary" type="submit">
                Queue test email
              </button>
            </form>
          ) : null}
        </div>
      </section>

      <section className="grid-2">
        <form action={recordMessageLogAction} className="card form-grid">
          <h2 style={{ fontSize: "1.35rem" }}>Record manual delivery note</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="log-template">Template</label>
              <select id="log-template" name="templateId" defaultValue="">
                <option value="">No template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="log-status">Status</label>
              <select id="log-status" name="status" defaultValue={MessageLogStatus.SENT}>
                {Object.values(MessageLogStatus).map((status) => (
                  <option key={status} value={status}>
                    {enumLabel(status)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="log-channel">Channel</label>
              <select id="log-channel" name="channel" defaultValue={MessageChannel.EMAIL}>
                {Object.values(MessageChannel).map((channel) => (
                  <option key={channel} value={channel}>
                    {enumLabel(channel)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="log-purpose">Purpose</label>
              <input id="log-purpose" name="purpose" placeholder="booking_confirmation" />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="recipient-email">Recipient email</label>
              <input id="recipient-email" name="recipientEmail" type="email" />
            </div>
            <div className="field">
              <label htmlFor="recipient-phone">Recipient phone</label>
              <input id="recipient-phone" name="recipientPhone" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="log-subject">Subject</label>
            <input id="log-subject" name="subject" />
          </div>
          <div className="field">
            <label htmlFor="log-body">Body preview</label>
            <textarea id="log-body" name="bodyPreview" />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="related-type">Related type</label>
              <input id="related-type" name="relatedType" placeholder="booking" />
            </div>
            <div className="field">
              <label htmlFor="related-id">Related id</label>
              <input id="related-id" name="relatedId" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="log-error">Error message</label>
            <input id="log-error" name="errorMessage" />
          </div>
          <button className="button secondary" type="submit">
            Record manual note
          </button>
        </form>

        <div className="card stack">
          <h2 style={{ fontSize: "1.35rem" }}>Actual outbox delivery</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Template</th>
                <th>Status</th>
                <th>Related</th>
                <th>Provider</th>
                <th>Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {outboxRows.map((row) => {
                const relatedHref = relatedRecordHref(row.relatedType, row.relatedId);
                const latestProviderEvent = row.providerEvents[0];

                return (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.recipientEmail}</strong>
                      <br />
                      <span style={{ color: "var(--muted)" }}>{row.subject || row.purpose}</span>
                    </td>
                    <td>{row.template?.name || row.templateKey || "Template removed"}</td>
                    <td>
                      <span className={outboxStatusClass(row.status)}>{enumLabel(row.status)}</span>
                      {row.lastError ? (
                        <>
                          <br />
                          <span style={{ color: "var(--muted)" }}>{row.lastError}</span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      {relatedHref ? (
                        <Link href={relatedHref}>
                          {row.relatedType} {row.relatedId.slice(0, 8)}
                        </Link>
                      ) : row.relatedType ? (
                        `${row.relatedType} ${row.relatedId.slice(0, 8)}`
                      ) : (
                        "None"
                      )}
                    </td>
                    <td>
                      {latestProviderEvent ? (
                        <>
                          <span className="pill">{enumLabel(latestProviderEvent.eventType)}</span>
                          <br />
                          <span style={{ color: "var(--muted)" }}>{formatDateTime(latestProviderEvent.createdAt, settings.timezone)}</span>
                        </>
                      ) : (
                        "None"
                      )}
                    </td>
                    <td>{formatDateTime(row.sentAt || row.updatedAt, settings.timezone)}</td>
                    <td>
                      {canResendStatus(row.status) ? (
                        <form action={resendEmailOutboxAction}>
                          <input type="hidden" name="id" value={row.id} />
                          <button className="button secondary" type="submit">
                            Resend
                          </button>
                        </form>
                      ) : (
                        <span className="pill">Active</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!outboxRows.length ? (
                <tr>
                  <td colSpan={7}>No outbox rows yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div className="subpanel">
            <h3 style={{ fontSize: "1.05rem" }}>Manual notes</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Status</th>
                  <th>Logged</th>
                </tr>
              </thead>
              <tbody>
                {manualLogs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <strong>{log.recipientEmail || log.recipientPhone}</strong>
                      <br />
                      <span style={{ color: "var(--muted)" }}>{log.subject || log.purpose}</span>
                    </td>
                    <td>
                      <span className={logStatusClass(log.status)}>{enumLabel(log.status)}</span>
                    </td>
                    <td>{formatDateTime(log.createdAt, settings.timezone)}</td>
                  </tr>
                ))}
                {!manualLogs.length ? (
                  <tr>
                    <td colSpan={3}>No manual notes yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid-2">
        <form action={createSuppressionEntryAction} className="card form-grid">
          <h2 style={{ fontSize: "1.35rem" }}>Add suppression</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="suppression-email">Email</label>
              <input id="suppression-email" name="email" type="email" required />
            </div>
            <div className="field">
              <label htmlFor="suppression-source">Source</label>
              <input id="suppression-source" name="source" placeholder="admin" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="suppression-scope">Scope</label>
            <select id="suppression-scope" name="scope" defaultValue={EmailSuppressionScope.MARKETING}>
              {Object.values(EmailSuppressionScope).map((scope) => (
                <option key={scope} value={scope}>
                  {enumLabel(scope)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="suppression-reason">Reason</label>
            <input id="suppression-reason" name="reason" placeholder="Unsubscribed from marketing" />
          </div>
          <button className="button secondary" type="submit">
            Suppress email
          </button>
        </form>

        <div className="card stack">
          <h2 style={{ fontSize: "1.35rem" }}>Suppression list</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Scope</th>
                <th>Reason</th>
                <th>Added</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {suppressions.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.email}</td>
                  <td>{enumLabel(entry.scope)}</td>
                  <td>{entry.reason || entry.source}</td>
                  <td>{formatDateTime(entry.createdAt, settings.timezone)}</td>
                  <td>
                    <form action={deleteSuppressionEntryAction} className="form-grid">
                      <input type="hidden" name="id" value={entry.id} />
                      <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                        <input name="confirmDelete" type="checkbox" required />
                        Remove
                      </label>
                      <button className="button secondary" type="submit">
                        Unsuppress
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {!suppressions.length ? (
                <tr>
                  <td colSpan={5}>No suppressed contacts yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
