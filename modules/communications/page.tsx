import {
  EmailOutboxStatus,
  EmailSendingDomainStatus,
  EmailSuppressionScope,
  MessageChannel,
  MessageLogStatus,
  MessageTemplatePurpose } from "@prisma/client";
import { Copy, Mail, MessageSquareText, Plus, RotateCcw, ShieldOff } from "lucide-react";
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
  updateMessageTemplateStatusAction } from "./actions";
import { EmailTemplateBuilder } from "./components/email-template-builder";
import { Button, Card, EqualGrid, Table } from "@/components/ui";

export const dynamic = "force-dynamic";

type CommunicationsPageProps = {
  searchParams: Promise<{saved?: string;error?: string;previewTemplate?: string;sampleEvent?: string;tokensJson?: string;}>;
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
template: {purpose?: MessageTemplatePurpose;requiredTokens: unknown;optionalTokens: unknown;tokens: unknown;} | null,
sampleEvent: string)
{
  const tokenNames = [
  ...new Set([
  ...stringArrayFromUnknown(template?.requiredTokens),
  ...stringArrayFromUnknown(template?.optionalTokens),
  ...stringArrayFromUnknown(template?.tokens)]
  )];

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
  if (status === MessageLogStatus.SENT) return "ui-badge ui-badge-success";
  if (status === MessageLogStatus.FAILED || status === MessageLogStatus.SUPPRESSED) return "ui-badge ui-badge-danger";
  return "ui-badge";
}

function outboxStatusClass(status: EmailOutboxStatus) {
  if (status === EmailOutboxStatus.SENT) return "ui-badge ui-badge-success";
  if (status === EmailOutboxStatus.FAILED || status === EmailOutboxStatus.SUPPRESSED || status === EmailOutboxStatus.CANCELED) return "ui-badge ui-badge-danger";
  return "ui-badge";
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
  suppressedCount] =
  await Promise.all([
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
  prisma.suppressionListEntry.count({ where: { siteId: settings.siteId } })]
  );

  const verifiedSenderIdentities = senderIdentities.filter(
    (sender) => sender.isVerified && (!sender.sendingDomain || sender.sendingDomain.status === EmailSendingDomainStatus.VERIFIED)
  );
  const savedMessage = params.saved ? "Communications changes saved." : null;
  const errorMessage = params.error || null;
  const previewTemplate = templates.find((template) => template.id === params.previewTemplate) || templates[0] || null;
  const selectedSampleEvent = params.sampleEvent || defaultSampleEventFor(previewTemplate?.purpose);
  const previewTokensText =
  params.tokensJson || (previewTemplate ? JSON.stringify(sampleTokensFor(previewTemplate, selectedSampleEvent), null, 2) : "{}");
  const preview = previewTemplate ?
  await (async () => {
    try {
      return { rendered: await renderEmailTemplate(previewTemplate, parsePreviewTokens(previewTokensText)), error: "" };
    } catch (error) {
      return { rendered: null, error: error instanceof Error ? error.message : "Could not render preview." };
    }
  })() :
  null;
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
          <h1>Messages and delivery records</h1>
          <p>Email templates, manual delivery logs, and suppression controls for transactional and marketing guardrails.</p>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <EqualGrid as="section" min="220px">
        <Card>
          <Mail size={22} />
          <h3>{activeTemplateCount} active templates</h3>
          <p className="lead lead-compact">
            Ready for booking, order, invoice, form, and admin notification flows.
          </p>
        </Card>
        <Card>
          <MessageSquareText size={22} />
          <h3>{sentCount} sent emails</h3>
          <p className="lead lead-compact">
            Actual outbox rows marked sent by the email processor.
          </p>
        </Card>
        <Card>
          <ShieldOff size={22} />
          <h3>{suppressedCount} suppressed</h3>
          <p className="lead lead-compact">
            Contacts that should not receive marketing or nonessential messages.
          </p>
        </Card>
      </EqualGrid>

      <section className="email-builder-launchpad" aria-labelledby="email-builder-heading">
        <div className="email-builder-launchpad-header">
          <div>
            <h2 className="section-title" id="email-builder-heading">Visual email playground</h2>
            <p>
              Open any email in a full-screen builder with blocks, text tools, token insertion, preview, and text fallback.
            </p>
          </div>
          <span className="ui-badge">{emailTemplates.length} email templates</span>
        </div>
        <div className="email-template-launcher-list">
          {emailTemplates.map((template) => {
            const requiredTokens = stringArrayFromUnknown(template.requiredTokens);
            const availableTokens = [
            ...new Set([...requiredTokens, ...stringArrayFromUnknown(template.optionalTokens), ...stringArrayFromUnknown(template.tokens)])];


            return (
              <div className="email-template-launcher-item" key={template.id}>
                  <EmailTemplateBuilder
                    availableTokens={availableTokens}
                    builderJson={template.builderJson}
                    htmlBody={template.htmlBody}
                    id={template.id}
                    idPrefix={`builder-${template.id}`}
                    isBuilderTemplate={hasBuilderJson(template.builderJson)}
                    previewText={template.previewText}
                    purposeLabel={enumLabel(template.purpose)}
                    requiredTokens={requiredTokens}
                    selectedSenderIdentityId={template.senderIdentityId}
                    senderIdentities={verifiedSenderIdentities}
                    subject={template.subject}
                    templateKey={template.key || ""}
                    templateName={template.name}
                    textBody={template.textBody || template.body}
                    updateAction={updateMessageTemplateBuilderAction} />
                <details className="email-version-drawer">
                  <summary>Version history</summary>
                  {(versionsByTemplateId.get(template.id) || []).slice(0, 5).map((version) =>
                  <form action={restoreMessageTemplateVersionAction} className="grid-2" key={version.id}>
                      <input type="hidden" name="templateId" value={template.id} />
                      <input type="hidden" name="versionId" value={version.id} />
                      <div>
                        <strong>Version {version.version}</strong>
                        <br />
                        <small className="muted-text">
                          {formatDateTime(version.createdAt, settings.timezone)} {version.note ? `- ${version.note}` : ""}
                        </small>
                      </div>
                      <div className="ui-zero">
                        <label className="ui-zero">
                          <input name="confirmRestore" type="checkbox" required />
                          Restore
                        </label>
                        <Button type="submit" variant="secondary">
                          <RotateCcw size={16} />
                          Restore version
                        </Button>
                      </div>
                    </form>
                  )}
                  {!(versionsByTemplateId.get(template.id) || []).length ?
                  <small className="muted-text">Versions appear after the first save.</small> :
                  null}
                </details>
              </div>);

          })}
          {!emailTemplates.length ? <div className="empty-state">No email templates found.</div> : null}
        </div>
      </section>

      <EqualGrid as="section">
        <Card action={createMessageTemplateAction} as="form" minHeight="none" bodyClassName="form-grid">
          <h2 className="section-title">Create manual template</h2>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="template-name">Name</label>
              <input id="template-name" name="name" required />
            </div>
            <div className="ui-field">
              <label htmlFor="template-purpose">Purpose</label>
              <select id="template-purpose" name="purpose" defaultValue={MessageTemplatePurpose.BOOKING_CONFIRMATION}>
                {Object.values(MessageTemplatePurpose).map((purpose) =>
                <option key={purpose} value={purpose}>
                    {enumLabel(purpose)}
                  </option>
                )}
              </select>
            </div>
          </EqualGrid>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="template-channel">Channel</label>
              <select id="template-channel" name="channel" defaultValue={MessageChannel.EMAIL}>
                {Object.values(MessageChannel).map((channel) =>
                <option key={channel} value={channel}>
                    {enumLabel(channel)}
                  </option>
                )}
              </select>
            </div>
            <label className="ui-zero">
              <input name="isActive" type="checkbox" defaultChecked />
              Active
            </label>
          </EqualGrid>
          <div className="ui-field">
            <label htmlFor="template-subject">Subject</label>
            <input id="template-subject" name="subject" placeholder="{{businessName}} appointment request" />
          </div>
          <div className="ui-field">
            <label htmlFor="template-body">Body</label>
            <textarea id="template-body" name="body" required />
          </div>
          <div className="ui-field">
            <label htmlFor="template-tokens">Allowed tokens</label>
            <input id="template-tokens" name="tokens" placeholder="businessName, customerName, appointmentTime" />
          </div>
          <Button type="submit">
            <Plus size={18} />
            Add manual template
          </Button>
        </Card>

        <Card bodyClassName="ui-stack">
          <h2 className="section-title">Template library</h2>
          <Table>
            <thead>
              <tr>
                <th>Template</th>
                <th>Purpose</th>
                <th>State</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) =>
              <tr key={template.id}>
                  <td>
                    <strong>{template.name}</strong>
                    <br />
                    <span className="muted-text">
                      {template.key ? `System key: ${template.key}` : stringArrayCsv(template.tokens) || "No token allowlist"}
                    </span>
                  </td>
                  <td>
                    {enumLabel(template.purpose)}
                    <br />
                    <span className="muted-text">{enumLabel(template.channel)}</span>
                  </td>
                  <td>
                    <span className={template.isActive ? "ui-badge ui-badge-success" : "ui-badge ui-badge-danger"}>{template.isActive ? "active" : "inactive"}</span>
                  </td>
                  <td>
                    <div className="ui-zero">
                      {template.key ?
                    <span className="ui-badge">Status locked</span> :

                    <form action={updateMessageTemplateStatusAction}>
                          <input type="hidden" name="id" value={template.id} />
                          <input type="hidden" name="isActive" value={template.isActive ? "false" : "true"} />
                          <Button type="submit" variant="secondary">
                            {template.isActive ? "Pause" : "Activate"}
                          </Button>
                        </form>
                    }
                      <form action={cloneMessageTemplateAction}>
                        <input type="hidden" name="sourceTemplateId" value={template.id} />
                        <input type="hidden" name="name" value={`Copy of ${template.name}`} />
                        <Button type="submit" variant="secondary">
                          <Copy size={16} />
                          Clone
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              )}
              {!templates.length ?
              <tr>
                  <td colSpan={4}>No templates yet.</td>
                </tr> :
              null}
            </tbody>
          </Table>
        </Card>
      </EqualGrid>

      <EqualGrid as="section">
        <Card action="/admin/modules/communications" method="get" as="form" minHeight="none" bodyClassName="form-grid">
          <h2 className="section-title">Preview template</h2>
          <div className="ui-field">
            <label htmlFor="preview-template">Template</label>
            <select id="preview-template" name="previewTemplate" defaultValue={previewTemplate?.id || ""}>
              {templates.map((template) =>
              <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              )}
            </select>
          </div>
          <div className="ui-field">
            <label htmlFor="preview-sample-event">Sample event data</label>
            <select id="preview-sample-event" name="sampleEvent" defaultValue={selectedSampleEvent}>
              {["booking", "order", "invoice", "form", "gallery", "general"].map((event) =>
              <option key={event} value={event}>
                  {event}
                </option>
              )}
            </select>
          </div>
          <div className="ui-field">
            <label htmlFor="preview-tokens">Token JSON</label>
            <textarea id="preview-tokens" name="tokensJson" defaultValue={previewTokensText} />
          </div>
          <Button type="submit" variant="secondary">
            Render preview
          </Button>
        </Card>

        <Card bodyClassName="ui-stack">
          <h2 className="section-title">Rendered email</h2>
          {preview?.error ? <div className="error">{preview.error}</div> : null}
          {preview?.rendered ?
          <div className="subpanel stack">
              <div>
                <p className="ui-zero">Subject</p>
                <strong>{preview.rendered.subject || "No subject"}</strong>
              </div>
              <div>
                <p className="ui-zero">Preview text</p>
                <p>{preview.rendered.previewText || "No preview text"}</p>
              </div>
              <div>
                <p className="ui-zero">Text body</p>
                <pre className="ui-zero">{preview.rendered.textBody}</pre>
              </div>
              <div>
                <p className="ui-zero">HTML preview</p>
                <iframe className="ui-zero"
              sandbox=""
              srcDoc={preview.rendered.htmlBody}

              title="Rendered email HTML preview" />
              
              </div>
            </div> :
          null}
          {previewTemplate ?
          <form action={sendTemplateTestEmailAction} className="subpanel form-grid">
              <input type="hidden" name="templateId" value={previewTemplate.id} />
              <input type="hidden" name="tokensJson" value={previewTokensText} />
              <div className="ui-field">
                <label htmlFor="test-recipient">Test recipient</label>
                <input id="test-recipient" name="recipientEmail" type="email" defaultValue={settings.contactEmail} required />
              </div>
              <Button type="submit" variant="secondary">
                Queue test email
              </Button>
            </form> :
          null}
        </Card>
      </EqualGrid>

      <EqualGrid as="section">
        <Card action={recordMessageLogAction} as="form" minHeight="none" bodyClassName="form-grid">
          <h2 className="section-title">Record manual delivery note</h2>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="log-template">Template</label>
              <select id="log-template" name="templateId" defaultValue="">
                <option value="">No template</option>
                {templates.map((template) =>
                <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                )}
              </select>
            </div>
            <div className="ui-field">
              <label htmlFor="log-status">Status</label>
              <select id="log-status" name="status" defaultValue={MessageLogStatus.SENT}>
                {Object.values(MessageLogStatus).map((status) =>
                <option key={status} value={status}>
                    {enumLabel(status)}
                  </option>
                )}
              </select>
            </div>
          </EqualGrid>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="log-channel">Channel</label>
              <select id="log-channel" name="channel" defaultValue={MessageChannel.EMAIL}>
                {Object.values(MessageChannel).map((channel) =>
                <option key={channel} value={channel}>
                    {enumLabel(channel)}
                  </option>
                )}
              </select>
            </div>
            <div className="ui-field">
              <label htmlFor="log-purpose">Purpose</label>
              <input id="log-purpose" name="purpose" placeholder="booking_confirmation" />
            </div>
          </EqualGrid>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="recipient-email">Recipient email</label>
              <input id="recipient-email" name="recipientEmail" type="email" />
            </div>
            <div className="ui-field">
              <label htmlFor="recipient-phone">Recipient phone</label>
              <input id="recipient-phone" name="recipientPhone" />
            </div>
          </EqualGrid>
          <div className="ui-field">
            <label htmlFor="log-subject">Subject</label>
            <input id="log-subject" name="subject" />
          </div>
          <div className="ui-field">
            <label htmlFor="log-body">Body preview</label>
            <textarea id="log-body" name="bodyPreview" />
          </div>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="related-type">Related type</label>
              <input id="related-type" name="relatedType" placeholder="booking" />
            </div>
            <div className="ui-field">
              <label htmlFor="related-id">Related id</label>
              <input id="related-id" name="relatedId" />
            </div>
          </EqualGrid>
          <div className="ui-field">
            <label htmlFor="log-error">Error message</label>
            <input id="log-error" name="errorMessage" />
          </div>
          <Button type="submit" variant="secondary">
            Record manual note
          </Button>
        </Card>

        <Card bodyClassName="ui-stack">
          <h2 className="section-title">Actual outbox delivery</h2>
          <Table>
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
                      <span className="muted-text">{row.subject || row.purpose}</span>
                    </td>
                    <td>{row.template?.name || row.templateKey || "Template removed"}</td>
                    <td>
                      <span className={outboxStatusClass(row.status)}>{enumLabel(row.status)}</span>
                      {row.lastError ?
                      <>
                          <br />
                          <span className="muted-text">{row.lastError}</span>
                        </> :
                      null}
                    </td>
                    <td>
                      {relatedHref ?
                      <Link href={relatedHref}>
                          {row.relatedType} {row.relatedId.slice(0, 8)}
                        </Link> :
                      row.relatedType ?
                      `${row.relatedType} ${row.relatedId.slice(0, 8)}` :

                      "None"
                      }
                    </td>
                    <td>
                      {latestProviderEvent ?
                      <>
                          <span className="ui-badge">{enumLabel(latestProviderEvent.eventType)}</span>
                          <br />
                          <span className="muted-text">{formatDateTime(latestProviderEvent.createdAt, settings.timezone)}</span>
                        </> :

                      "None"
                      }
                    </td>
                    <td>{formatDateTime(row.sentAt || row.updatedAt, settings.timezone)}</td>
                    <td>
                      {canResendStatus(row.status) ?
                      <form action={resendEmailOutboxAction}>
                          <input type="hidden" name="id" value={row.id} />
                          <Button type="submit" variant="secondary">
                            Resend
                          </Button>
                        </form> :

                      <span className="ui-badge">Active</span>
                      }
                    </td>
                  </tr>);

              })}
              {!outboxRows.length ?
              <tr>
                  <td colSpan={7}>No outbox rows yet.</td>
                </tr> :
              null}
            </tbody>
          </Table>
          <div className="subpanel">
            <h3 className="subsection-title">Manual notes</h3>
            <Table>
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Status</th>
                  <th>Logged</th>
                </tr>
              </thead>
              <tbody>
                {manualLogs.map((log) =>
                <tr key={log.id}>
                    <td>
                      <strong>{log.recipientEmail || log.recipientPhone}</strong>
                      <br />
                      <span className="muted-text">{log.subject || log.purpose}</span>
                    </td>
                    <td>
                      <span className={logStatusClass(log.status)}>{enumLabel(log.status)}</span>
                    </td>
                    <td>{formatDateTime(log.createdAt, settings.timezone)}</td>
                  </tr>
                )}
                {!manualLogs.length ?
                <tr>
                    <td colSpan={3}>No manual notes yet.</td>
                  </tr> :
                null}
              </tbody>
            </Table>
          </div>
        </Card>
      </EqualGrid>

      <EqualGrid as="section">
        <Card action={createSuppressionEntryAction} as="form" minHeight="none" bodyClassName="form-grid">
          <h2 className="section-title">Add suppression</h2>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="suppression-email">Email</label>
              <input id="suppression-email" name="email" type="email" required />
            </div>
            <div className="ui-field">
              <label htmlFor="suppression-source">Source</label>
              <input id="suppression-source" name="source" placeholder="admin" />
            </div>
          </EqualGrid>
          <div className="ui-field">
            <label htmlFor="suppression-scope">Scope</label>
            <select id="suppression-scope" name="scope" defaultValue={EmailSuppressionScope.MARKETING}>
              {Object.values(EmailSuppressionScope).map((scope) =>
              <option key={scope} value={scope}>
                  {enumLabel(scope)}
                </option>
              )}
            </select>
          </div>
          <div className="ui-field">
            <label htmlFor="suppression-reason">Reason</label>
            <input id="suppression-reason" name="reason" placeholder="Unsubscribed from marketing" />
          </div>
          <Button type="submit" variant="secondary">
            Suppress email
          </Button>
        </Card>

        <Card bodyClassName="ui-stack">
          <h2 className="section-title">Suppression list</h2>
          <Table>
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
              {suppressions.map((entry) =>
              <tr key={entry.id}>
                  <td>{entry.email}</td>
                  <td>{enumLabel(entry.scope)}</td>
                  <td>{entry.reason || entry.source}</td>
                  <td>{formatDateTime(entry.createdAt, settings.timezone)}</td>
                  <td>
                    <form action={deleteSuppressionEntryAction} className="form-grid">
                      <input type="hidden" name="id" value={entry.id} />
                      <label className="ui-zero">
                        <input name="confirmDelete" type="checkbox" required />
                        Remove
                      </label>
                      <Button type="submit" variant="secondary">
                        Unsuppress
                      </Button>
                    </form>
                  </td>
                </tr>
              )}
              {!suppressions.length ?
              <tr>
                  <td colSpan={5}>No suppressed contacts yet.</td>
                </tr> :
              null}
            </tbody>
          </Table>
        </Card>
      </EqualGrid>
    </div>);

}
