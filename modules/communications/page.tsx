import { EmailOutboxStatus, EmailSuppressionScope, MessageChannel, MessageLogStatus, MessageTemplatePurpose } from "@prisma/client";
import { Mail, MessageSquareText, Plus, ShieldOff } from "lucide-react";
import { renderEmailTemplate } from "@/lib/email/render";
import { enumLabel, formatDateTime, stringArrayCsv, stringArrayFromUnknown } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import {
  createMessageTemplateAction,
  createSuppressionEntryAction,
  deleteSuppressionEntryAction,
  recordMessageLogAction,
  sendTemplateTestEmailAction,
  updateMessageTemplateStatusAction
} from "./actions";

export const dynamic = "force-dynamic";

type CommunicationsPageProps = {
  searchParams: Promise<{ saved?: string; error?: string; previewTemplate?: string; tokensJson?: string }>;
};

function sampleTokensFor(template: { requiredTokens: unknown; optionalTokens: unknown } | null) {
  const tokenNames = [...stringArrayFromUnknown(template?.requiredTokens), ...stringArrayFromUnknown(template?.optionalTokens)];

  return Object.fromEntries(
    tokenNames.map((token) => {
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

export default async function CommunicationsPage({ searchParams }: CommunicationsPageProps) {
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const [templates, outboxRows, manualLogs, suppressions, activeTemplateCount, sentCount, suppressedCount] = await Promise.all([
    prisma.messageTemplate.findMany({
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      take: 30
    }),
    prisma.emailOutbox.findMany({
      include: { template: true },
      orderBy: { createdAt: "desc" },
      take: 20
    }),
    prisma.messageLog.findMany({
      include: { template: true },
      orderBy: { createdAt: "desc" },
      take: 8
    }),
    prisma.suppressionListEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.messageTemplate.count({ where: { isActive: true } }),
    prisma.emailOutbox.count({ where: { status: EmailOutboxStatus.SENT } }),
    prisma.suppressionListEntry.count()
  ]);

  const savedMessage = params.saved ? "Communications changes saved." : null;
  const errorMessage = params.error || null;
  const previewTemplate = templates.find((template) => template.id === params.previewTemplate) || templates[0] || null;
  const previewTokensText =
    params.tokensJson || (previewTemplate ? JSON.stringify(sampleTokensFor(previewTemplate), null, 2) : "{}");
  const preview = previewTemplate
    ? (() => {
        try {
          return { rendered: renderEmailTemplate(previewTemplate, parsePreviewTokens(previewTokensText)), error: "" };
        } catch (error) {
          return { rendered: null, error: error instanceof Error ? error.message : "Could not render preview." };
        }
      })()
    : null;

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
                    {template.key ? (
                      <span className="pill">System read-only</span>
                    ) : (
                      <form action={updateMessageTemplateStatusAction}>
                        <input type="hidden" name="id" value={template.id} />
                        <input type="hidden" name="isActive" value={template.isActive ? "false" : "true"} />
                        <button className="button secondary" type="submit">
                          {template.isActive ? "Pause" : "Activate"}
                        </button>
                      </form>
                    )}
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
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {outboxRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.recipientEmail}</strong>
                    <br />
                    <span style={{ color: "var(--muted)" }}>{row.subject || row.purpose}</span>
                  </td>
                  <td>{row.template?.name || row.templateKey || "Template removed"}</td>
                  <td>
                    <span className={outboxStatusClass(row.status)}>{enumLabel(row.status)}</span>
                  </td>
                  <td>{formatDateTime(row.updatedAt, settings.timezone)}</td>
                </tr>
              ))}
              {!outboxRows.length ? (
                <tr>
                  <td colSpan={4}>No outbox rows yet.</td>
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
