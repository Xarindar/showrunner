import {
  AutomationAction,
  AutomationRunStatus,
  AutomationStatus,
  AutomationTrigger,
  WebhookDeliveryStatus
} from "@prisma/client";
import { Play, Plus, Webhook, Workflow } from "lucide-react";
import { moduleEventNames } from "@/lib/events/catalog";
import { enumLabel, formatDateTime, stringArrayCsv } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import {
  createAutomationAction,
  createWebhookEndpointAction,
  deleteAutomationAction,
  deleteWebhookEndpointAction,
  recordAutomationRunAction,
  recordWebhookDeliveryAction,
  updateAutomationAction,
  updateWebhookEndpointAction,
  updateAutomationStatusAction
} from "./actions";

export const dynamic = "force-dynamic";

type AutomationPageProps = {
  searchParams: Promise<{ saved?: string; error?: string; automation?: string }>;
};

function automationStatusClass(status: AutomationStatus) {
  if (status === AutomationStatus.ACTIVE) return "pill success";
  if (status === AutomationStatus.PAUSED) return "pill danger";
  return "pill";
}

function runStatusClass(status: string) {
  if (status === AutomationRunStatus.SUCCEEDED || status === WebhookDeliveryStatus.DELIVERED) return "pill success";
  if (status === "FAILED") return "pill danger";
  return "pill";
}

function conditionEntry(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { key: "", value: "" };
  const [key, item] = Object.entries(value as Record<string, unknown>)[0] || ["", ""];
  return { key, value: String(item || "") };
}

export default async function AutomationPage({ searchParams }: AutomationPageProps) {
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const [automations, endpoints, recentDeliveries, activeCount, runCount] = await Promise.all([
    prisma.automation.findMany({
      include: { _count: { select: { runs: true } } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 30
    }),
    prisma.webhookEndpoint.findMany({
      include: { _count: { select: { deliveries: true } } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 20
    }),
    prisma.webhookDelivery.findMany({
      include: { automation: true, webhookEndpoint: true },
      orderBy: { createdAt: "desc" },
      take: 10
    }),
    prisma.automation.count({ where: { status: AutomationStatus.ACTIVE } }),
    prisma.automationRun.count()
  ]);

  const selectedAutomationId = params.automation || automations[0]?.id;
  const selectedAutomation = selectedAutomationId
    ? await prisma.automation.findUnique({
        where: { id: selectedAutomationId },
        include: { runs: { orderBy: { createdAt: "desc" }, take: 10 } }
      })
    : null;
  const savedMessage = params.saved ? "Automation changes saved." : null;
  const errorMessage = params.error || null;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Automation</p>
          <h1 style={{ fontSize: "2.4rem" }}>Rules, runs, and webhooks</h1>
          <p>Define trigger-action rules, keep run records, and prepare signed outbound webhooks for integrations.</p>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <section className="grid-3">
        <div className="card">
          <Workflow size={22} />
          <h3>{activeCount} active rules</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Trigger-action rules that can be wired into booking, forms, commerce, billing, and gallery events.
          </p>
        </div>
        <div className="card">
          <Play size={22} />
          <h3>{runCount} run records</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Live event matches plus operator-entered test notes.
          </p>
        </div>
        <div className="card">
          <Webhook size={22} />
          <h3>{endpoints.length} webhook endpoints</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Destinations ready for signed outbound event delivery.
          </p>
        </div>
      </section>

      <section className="grid-2">
        <form action={createAutomationAction} className="card form-grid">
          <h2 style={{ fontSize: "1.35rem" }}>Create automation</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="automation-name">Name</label>
              <input id="automation-name" name="name" required />
            </div>
            <div className="field">
              <label htmlFor="automation-status">Status</label>
              <select id="automation-status" name="status" defaultValue={AutomationStatus.DRAFT}>
                {Object.values(AutomationStatus).map((status) => (
                  <option key={status} value={status}>
                    {enumLabel(status)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="automation-trigger">Trigger</label>
              <select id="automation-trigger" name="trigger" defaultValue={AutomationTrigger.FORM_SUBMITTED}>
                {Object.values(AutomationTrigger).map((trigger) => (
                  <option key={trigger} value={trigger}>
                    {enumLabel(trigger)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="automation-action">Action</label>
              <select id="automation-action" name="action" defaultValue={AutomationAction.NOTIFY_ADMIN}>
                {Object.values(AutomationAction).map((action) => (
                  <option key={action} value={action}>
                    {enumLabel(action)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="automation-email">Target email</label>
              <input id="automation-email" name="targetEmail" type="email" />
            </div>
            <div className="field">
              <label htmlFor="automation-url">Webhook URL</label>
              <input id="automation-url" name="webhookUrl" placeholder="https://example.com/webhook" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="automation-subject">Subject template</label>
            <input id="automation-subject" name="subjectTemplate" placeholder="New {{trigger}} event" />
          </div>
          <div className="field">
            <label htmlFor="automation-body">Body template</label>
            <textarea id="automation-body" name="bodyTemplate" />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="condition-key">Condition key</label>
              <input id="condition-key" name="conditionKey" placeholder="formSlug" />
            </div>
            <div className="field">
              <label htmlFor="condition-value">Condition value</label>
              <input id="condition-value" name="conditionValue" placeholder="contact-inquiry" />
            </div>
          </div>
          <button className="button" type="submit">
            <Plus size={18} />
            Create automation
          </button>
        </form>

        <div className="card stack">
          <h2 style={{ fontSize: "1.35rem" }}>Automation rules</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Trigger</th>
                <th>Action</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {automations.map((automation) => (
                <tr key={automation.id}>
                  <td>
                    <a href={`/admin/modules/automation?automation=${automation.id}`}>{automation.name}</a>
                    <br />
                    <span style={{ color: "var(--muted)" }}>{automation._count.runs} runs</span>
                  </td>
                  <td>{enumLabel(automation.trigger)}</td>
                  <td>{enumLabel(automation.action)}</td>
                  <td>
                    <span className={automationStatusClass(automation.status)}>{enumLabel(automation.status)}</span>
                  </td>
                </tr>
              ))}
              {!automations.length ? (
                <tr>
                  <td colSpan={4}>No automations yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selectedAutomation ? (
        <section className="grid-2">
          <div className="card stack">
            {(() => {
              const condition = conditionEntry(selectedAutomation.conditions);
              return (
                <form action={updateAutomationAction} className="subpanel form-grid">
                  <input type="hidden" name="id" value={selectedAutomation.id} />
                  <h3 style={{ fontSize: "1.05rem" }}>Edit automation</h3>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor={`automation-${selectedAutomation.id}-name`}>Name</label>
                      <input id={`automation-${selectedAutomation.id}-name`} name="name" defaultValue={selectedAutomation.name} required />
                    </div>
                    <div className="field">
                      <label htmlFor={`automation-${selectedAutomation.id}-status`}>Status</label>
                      <select id={`automation-${selectedAutomation.id}-status`} name="status" defaultValue={selectedAutomation.status}>
                        {Object.values(AutomationStatus).map((status) => (
                          <option key={status} value={status}>
                            {enumLabel(status)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor={`automation-${selectedAutomation.id}-trigger`}>Trigger</label>
                      <select id={`automation-${selectedAutomation.id}-trigger`} name="trigger" defaultValue={selectedAutomation.trigger}>
                        {Object.values(AutomationTrigger).map((trigger) => (
                          <option key={trigger} value={trigger}>
                            {enumLabel(trigger)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`automation-${selectedAutomation.id}-action`}>Action</label>
                      <select id={`automation-${selectedAutomation.id}-action`} name="action" defaultValue={selectedAutomation.action}>
                        {Object.values(AutomationAction).map((action) => (
                          <option key={action} value={action}>
                            {enumLabel(action)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor={`automation-${selectedAutomation.id}-email`}>Target email</label>
                      <input
                        id={`automation-${selectedAutomation.id}-email`}
                        name="targetEmail"
                        type="email"
                        defaultValue={selectedAutomation.targetEmail || ""}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`automation-${selectedAutomation.id}-url`}>Webhook URL</label>
                      <input
                        id={`automation-${selectedAutomation.id}-url`}
                        name="webhookUrl"
                        defaultValue={selectedAutomation.webhookUrl || ""}
                        placeholder="https://example.com/webhook"
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor={`automation-${selectedAutomation.id}-subject`}>Subject template</label>
                    <input id={`automation-${selectedAutomation.id}-subject`} name="subjectTemplate" defaultValue={selectedAutomation.subjectTemplate} />
                  </div>
                  <div className="field">
                    <label htmlFor={`automation-${selectedAutomation.id}-body`}>Body template</label>
                    <textarea id={`automation-${selectedAutomation.id}-body`} name="bodyTemplate" defaultValue={selectedAutomation.bodyTemplate} />
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor={`automation-${selectedAutomation.id}-condition-key`}>Simple condition key</label>
                      <input id={`automation-${selectedAutomation.id}-condition-key`} name="conditionKey" defaultValue={condition.key} />
                    </div>
                    <div className="field">
                      <label htmlFor={`automation-${selectedAutomation.id}-condition-value`}>Simple condition value</label>
                      <input id={`automation-${selectedAutomation.id}-condition-value`} name="conditionValue" defaultValue={condition.value} />
                    </div>
                  </div>
                  <button className="button secondary" type="submit">
                    Save automation
                  </button>
                </form>
              );
            })()}
            <div className="page-header" style={{ marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: "1.35rem" }}>{selectedAutomation.name}</h2>
                <p>
                  {enumLabel(selectedAutomation.trigger)} -&gt; {enumLabel(selectedAutomation.action)}
                </p>
              </div>
              <span className={automationStatusClass(selectedAutomation.status)}>{enumLabel(selectedAutomation.status)}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[AutomationStatus.ACTIVE, AutomationStatus.PAUSED, AutomationStatus.DRAFT].map((status) => (
                <form action={updateAutomationStatusAction} key={status}>
                  <input type="hidden" name="id" value={selectedAutomation.id} />
                  <input type="hidden" name="status" value={status} />
                  <button className="button secondary" type="submit">
                    Mark {enumLabel(status)}
                  </button>
                </form>
              ))}
            </div>
            <form action={recordAutomationRunAction} className="subpanel form-grid">
              <input type="hidden" name="automationId" value={selectedAutomation.id} />
              <h3 style={{ fontSize: "1.05rem" }}>Record manual run</h3>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="run-status">Status</label>
                  <select id="run-status" name="status" defaultValue={AutomationRunStatus.SUCCEEDED}>
                    {Object.values(AutomationRunStatus).map((status) => (
                      <option key={status} value={status}>
                        {enumLabel(status)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="run-key">Trigger key</label>
                  <input id="run-key" name="triggerKey" placeholder="manual-test" />
                </div>
              </div>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="run-related-type">Related type</label>
                  <input id="run-related-type" name="relatedType" placeholder="form_submission" />
                </div>
                <div className="field">
                  <label htmlFor="run-related-id">Related id</label>
                  <input id="run-related-id" name="relatedId" />
                </div>
              </div>
              <div className="field">
                <label htmlFor="run-summary">Summary</label>
                <input id="run-summary" name="summary" placeholder="Matched rule and queued admin notification." />
              </div>
              <button className="button secondary" type="submit">
                Record manual run
              </button>
            </form>
            <form action={deleteAutomationAction} className="subpanel form-grid">
              <input type="hidden" name="id" value={selectedAutomation.id} />
              <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                <input name="confirmDelete" type="checkbox" required />
                Delete this automation and its run records.
              </label>
              <button className="button danger" type="submit">
                Delete automation
              </button>
            </form>
          </div>

          <div className="card stack">
            <h2 style={{ fontSize: "1.35rem" }}>Run history</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Summary</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {selectedAutomation.runs.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <span className={runStatusClass(run.status)}>{enumLabel(run.status)}</span>
                    </td>
                    <td>
                      {run.summary || run.triggerKey || "No summary"}
                      <br />
                      <span style={{ color: "var(--muted)" }}>{run.relatedType || "No related record"}</span>
                    </td>
                    <td>{formatDateTime(run.createdAt, settings.timezone)}</td>
                  </tr>
                ))}
                {!selectedAutomation.runs.length ? (
                  <tr>
                    <td colSpan={3}>No runs recorded yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="grid-2">
        <form action={createWebhookEndpointAction} className="card form-grid">
          <h2 style={{ fontSize: "1.35rem" }}>Create webhook endpoint</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="webhook-name">Name</label>
              <input id="webhook-name" name="name" required />
            </div>
            <div className="field">
              <label htmlFor="webhook-status">Status</label>
              <select id="webhook-status" name="status" defaultValue={AutomationStatus.DRAFT}>
                {Object.values(AutomationStatus).map((status) => (
                  <option key={status} value={status}>
                    {enumLabel(status)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="webhook-url">URL</label>
            <input id="webhook-url" name="url" placeholder="https://example.com/showrunner" required />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="webhook-secret">Signing secret</label>
              <input id="webhook-secret" name="signingSecret" placeholder="Generated if left blank" type="password" />
            </div>
            <div className="field">
              <label htmlFor="webhook-events">Events</label>
              <input id="webhook-events" name="events" placeholder={moduleEventNames.join(", ")} />
            </div>
          </div>
          <button className="button secondary" type="submit">
            Add endpoint
          </button>
        </form>

        <div className="card stack">
          <h2 style={{ fontSize: "1.35rem" }}>Webhook endpoints</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Target</th>
                <th>Events</th>
                <th>State</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((endpoint) => (
                <tr key={endpoint.id}>
                  <td>
                    <strong>{endpoint.name}</strong>
                    <br />
                    <span style={{ color: "var(--muted)" }}>{endpoint.url}</span>
                  </td>
                  <td>{stringArrayCsv(endpoint.events) || "No events"}</td>
                  <td>
                    <span className={automationStatusClass(endpoint.status)}>{enumLabel(endpoint.status)}</span>
                  </td>
                  <td>
                    <details>
                      <summary>Edit</summary>
                      <form action={updateWebhookEndpointAction} className="form-grid" style={{ marginTop: 12, minWidth: 300 }}>
                        <input type="hidden" name="id" value={endpoint.id} />
                        <div className="field">
                          <label htmlFor={`webhook-${endpoint.id}-name`}>Name</label>
                          <input id={`webhook-${endpoint.id}-name`} name="name" defaultValue={endpoint.name} required />
                        </div>
                        <div className="field">
                          <label htmlFor={`webhook-${endpoint.id}-url`}>URL</label>
                          <input id={`webhook-${endpoint.id}-url`} name="url" defaultValue={endpoint.url} required />
                        </div>
                        <div className="grid-2">
                          <div className="field">
                            <label htmlFor={`webhook-${endpoint.id}-status`}>Status</label>
                            <select id={`webhook-${endpoint.id}-status`} name="status" defaultValue={endpoint.status}>
                              {Object.values(AutomationStatus).map((status) => (
                                <option key={status} value={status}>
                                  {enumLabel(status)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="field">
                            <label htmlFor={`webhook-${endpoint.id}-secret`}>Rotate secret</label>
                            <input id={`webhook-${endpoint.id}-secret`} name="signingSecret" placeholder="Leave blank to keep current" type="password" />
                          </div>
                        </div>
                        <div className="field">
                          <label htmlFor={`webhook-${endpoint.id}-events`}>Events</label>
                          <input id={`webhook-${endpoint.id}-events`} name="events" defaultValue={stringArrayCsv(endpoint.events)} />
                        </div>
                        <button className="button secondary" type="submit">
                          Save endpoint
                        </button>
                      </form>
                      <form action={deleteWebhookEndpointAction} className="form-grid" style={{ marginTop: 12, minWidth: 300 }}>
                        <input type="hidden" name="id" value={endpoint.id} />
                        <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                          <input name="confirmDelete" type="checkbox" required />
                          Delete this endpoint and delivery records.
                        </label>
                        <button className="button danger" type="submit">
                          Delete endpoint
                        </button>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}
              {!endpoints.length ? (
                <tr>
                  <td colSpan={4}>No webhook endpoints yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid-2">
        <form action={recordWebhookDeliveryAction} className="card form-grid">
          <h2 style={{ fontSize: "1.35rem" }}>Record manual webhook delivery</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="delivery-endpoint">Endpoint</label>
              <select id="delivery-endpoint" name="webhookEndpointId">
                {endpoints.map((endpoint) => (
                  <option key={endpoint.id} value={endpoint.id}>
                    {endpoint.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="delivery-status">Status</label>
              <select id="delivery-status" name="status" defaultValue={WebhookDeliveryStatus.DELIVERED}>
                {[WebhookDeliveryStatus.DELIVERED, WebhookDeliveryStatus.FAILED].map((status) => (
                  <option key={status} value={status}>
                    {enumLabel(status)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="delivery-event">Event</label>
              <select id="delivery-event" name="event" defaultValue="form.submitted">
                {moduleEventNames.map((event) => (
                  <option key={event} value={event}>
                    {event}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="delivery-code">Status code</label>
              <input id="delivery-code" name="statusCode" type="number" min="100" max="599" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="delivery-error">Error</label>
            <input id="delivery-error" name="errorMessage" />
          </div>
          <button className="button secondary" type="submit" disabled={!endpoints.length}>
            Record manual delivery
          </button>
        </form>

        <div className="card stack">
          <h2 style={{ fontSize: "1.35rem" }}>Webhook delivery records</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Target</th>
                <th>Event</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {recentDeliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td>
                    {delivery.webhookEndpoint?.name || delivery.automation?.name || "Manual delivery"}
                    <br />
                    <span style={{ color: "var(--muted)" }}>
                      {delivery.targetUrl || delivery.webhookEndpoint?.url || delivery.automation?.webhookUrl || "No target URL"}
                    </span>
                  </td>
                  <td>{delivery.event}</td>
                  <td>
                    <span className={runStatusClass(delivery.status)}>{enumLabel(delivery.status)}</span>
                  </td>
                  <td>{formatDateTime(delivery.createdAt, settings.timezone)}</td>
                </tr>
              ))}
              {!recentDeliveries.length ? (
                <tr>
                  <td colSpan={4}>No webhook deliveries recorded yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
