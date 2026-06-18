import {
  AutomationAction,
  AutomationRunStatus,
  AutomationStatus,
  AutomationTrigger,
  MessageChannel,
  WebhookDeliveryStatus } from "@prisma/client";
import { Play, Plus, Webhook, Workflow } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
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
  replayAutomationRunAction,
  updateAutomationAction,
  updateWebhookEndpointAction,
  updateAutomationStatusAction } from "./actions";
import { Button, Card, EqualGrid, Table } from "@/components/ui";

export const dynamic = "force-dynamic";

type AutomationPageProps = {
  searchParams: Promise<{saved?: string;error?: string;automation?: string;}>;
};

function automationStatusClass(status: AutomationStatus) {
  if (status === AutomationStatus.ACTIVE) return "ui-badge ui-badge-success";
  if (status === AutomationStatus.PAUSED) return "ui-badge ui-badge-danger";
  return "ui-badge";
}

function runStatusClass(status: string) {
  if (status === AutomationRunStatus.SUCCEEDED || status === WebhookDeliveryStatus.DELIVERED || status === "COMPLETED") return "ui-badge ui-badge-success";
  if (status === AutomationRunStatus.FAILED || status === WebhookDeliveryStatus.FAILED || status === AutomationRunStatus.DEAD_LETTER) {
    return "ui-badge ui-badge-danger";
  }
  if (status === AutomationRunStatus.PROCESSING) return "ui-badge ui-badge-warning";
  return "ui-badge";
}

function conditionEntry(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { key: "", value: "" };
  const [key, item] = Object.entries(value as Record<string, unknown>)[0] || ["", ""];
  return { key, value: String(item || "") };
}

function configTextareaValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length) return "";
  return JSON.stringify(value, null, 2);
}

export default async function AutomationPage({ searchParams }: AutomationPageProps) {
  await requireAdmin("automation:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const [automations, endpoints, recentDeliveries, messageTemplates, recentTasks, activeCount, runCount, deadLetterCount] = await Promise.all([
  prisma.automation.findMany({
    where: { siteId: settings.siteId },
    include: { _count: { select: { runs: true } } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 30
  }),
  prisma.webhookEndpoint.findMany({
    where: { siteId: settings.siteId },
    include: { _count: { select: { deliveries: true } } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 20
  }),
  prisma.webhookDelivery.findMany({
    where: {
      OR: [{ automation: { siteId: settings.siteId } }, { webhookEndpoint: { siteId: settings.siteId } }]
    },
    include: { automation: true, webhookEndpoint: true },
    orderBy: { createdAt: "desc" },
    take: 10
  }),
  prisma.messageTemplate.findMany({
    where: { siteId: settings.siteId, channel: MessageChannel.EMAIL, isActive: true, key: { not: null } },
    orderBy: [{ purpose: "asc" }, { name: "asc" }],
    take: 100
  }),
  prisma.automationTask.findMany({
    where: { siteId: settings.siteId },
    orderBy: { createdAt: "desc" },
    take: 10
  }),
  prisma.automation.count({ where: { siteId: settings.siteId, status: AutomationStatus.ACTIVE } }),
  prisma.automationRun.count({ where: { automation: { siteId: settings.siteId } } }),
  prisma.automationRun.count({ where: { automation: { siteId: settings.siteId }, status: AutomationRunStatus.DEAD_LETTER } })]
  );

  const selectedAutomationId = params.automation || automations[0]?.id;
  const selectedAutomation = selectedAutomationId ?
  await prisma.automation.findFirst({
    where: { id: selectedAutomationId, siteId: settings.siteId },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 10 } }
  }) :
  null;
  const savedMessage = params.saved ? "Automation changes saved." : null;
  const errorMessage = params.error || null;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Automation</p>
          <h1>Rules, runs, and webhooks</h1>
          <p>Define trigger-action rules, keep run records, and prepare signed outbound webhooks for integrations.</p>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <EqualGrid as="section" min="220px">
        <Card>
          <Workflow size={22} />
          <h3>{activeCount} active rules</h3>
          <p className="lead lead-compact">
            Trigger-action rules that can be wired into booking, forms, commerce, billing, and gallery events.
          </p>
        </Card>
        <Card>
          <Play size={22} />
          <h3>{runCount} run records</h3>
          <p className="lead lead-compact">
            Live event matches, queued executors, and {deadLetterCount} dead-lettered runs.
          </p>
        </Card>
        <Card>
          <Webhook size={22} />
          <h3>{endpoints.length} webhook endpoints</h3>
          <p className="lead lead-compact">
            Destinations ready for signed outbound event delivery.
          </p>
        </Card>
      </EqualGrid>

      <EqualGrid as="section">
        <Card action={createAutomationAction} as="form" minHeight="none" bodyClassName="form-grid">
          <h2 className="section-title">Create automation</h2>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="automation-name">Name</label>
              <input id="automation-name" name="name" required />
            </div>
            <div className="ui-field">
              <label htmlFor="automation-status">Status</label>
              <select id="automation-status" name="status" defaultValue={AutomationStatus.DRAFT}>
                {Object.values(AutomationStatus).map((status) =>
                <option key={status} value={status}>
                    {enumLabel(status)}
                  </option>
                )}
              </select>
            </div>
          </EqualGrid>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="automation-trigger">Trigger</label>
              <select id="automation-trigger" name="trigger" defaultValue={AutomationTrigger.FORM_SUBMITTED}>
                {Object.values(AutomationTrigger).map((trigger) =>
                <option key={trigger} value={trigger}>
                    {enumLabel(trigger)}
                  </option>
                )}
              </select>
            </div>
            <div className="ui-field">
              <label htmlFor="automation-action">Action</label>
              <select id="automation-action" name="action" defaultValue={AutomationAction.NOTIFY_ADMIN}>
                {Object.values(AutomationAction).map((action) =>
                <option key={action} value={action}>
                    {enumLabel(action)}
                  </option>
                )}
              </select>
            </div>
          </EqualGrid>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="automation-email">Target email</label>
              <input id="automation-email" name="targetEmail" type="email" />
            </div>
            <div className="ui-field">
              <label htmlFor="automation-url">Webhook URL</label>
              <input id="automation-url" name="webhookUrl" placeholder="https://example.com/webhook" />
            </div>
          </EqualGrid>
          <div className="ui-field">
            <label htmlFor="automation-template">Email template</label>
            <select id="automation-template" name="messageTemplateId" defaultValue="">
              <option value="">No template</option>
              {messageTemplates.map((template) =>
              <option key={template.id} value={template.id}>
                  {template.name} ({template.key})
                </option>
              )}
            </select>
          </div>
          <div className="ui-field">
            <label htmlFor="automation-subject">Subject template</label>
            <input id="automation-subject" name="subjectTemplate" placeholder="New {{trigger}} event" />
          </div>
          <div className="ui-field">
            <label htmlFor="automation-body">Body template</label>
            <textarea id="automation-body" name="bodyTemplate" />
          </div>
          <div className="ui-field">
            <label htmlFor="automation-config">Action config JSON</label>
            <textarea
              id="automation-config"
              name="actionConfig"
              placeholder={'{"targetStatus":"CONFIRMED","tag":"vip","title":"Follow up with {{actorEmail}}","dueInDays":2}'} />
            
          </div>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="condition-key">Condition key</label>
              <input id="condition-key" name="conditionKey" placeholder="formSlug" />
            </div>
            <div className="ui-field">
              <label htmlFor="condition-value">Condition value</label>
              <input id="condition-value" name="conditionValue" placeholder="contact-inquiry" />
            </div>
          </EqualGrid>
          <Button type="submit">
            <Plus size={18} />
            Create automation
          </Button>
        </Card>

        <Card bodyClassName="ui-stack">
          <h2 className="section-title">Automation rules</h2>
          <Table>
            <thead>
              <tr>
                <th>Rule</th>
                <th>Trigger</th>
                <th>Action</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {automations.map((automation) =>
              <tr key={automation.id}>
                  <td>
                    <a href={`/admin/modules/automation?automation=${automation.id}`}>{automation.name}</a>
                    <br />
                    <span className="muted-text">{automation._count.runs} runs</span>
                  </td>
                  <td>{enumLabel(automation.trigger)}</td>
                  <td>{enumLabel(automation.action)}</td>
                  <td>
                    <span className={automationStatusClass(automation.status)}>{enumLabel(automation.status)}</span>
                  </td>
                </tr>
              )}
              {!automations.length ?
              <tr>
                  <td colSpan={4}>No automations yet.</td>
                </tr> :
              null}
            </tbody>
          </Table>
        </Card>
      </EqualGrid>

      {selectedAutomation ?
      <EqualGrid as="section">
          <Card bodyClassName="ui-stack">
            {(() => {
            const condition = conditionEntry(selectedAutomation.conditions);
            return (
              <form action={updateAutomationAction} className="subpanel form-grid">
                  <input type="hidden" name="id" value={selectedAutomation.id} />
                  <h3 className="subsection-title">Edit automation</h3>
                  <EqualGrid>
                    <div className="ui-field">
                      <label htmlFor={`automation-${selectedAutomation.id}-name`}>Name</label>
                      <input id={`automation-${selectedAutomation.id}-name`} name="name" defaultValue={selectedAutomation.name} required />
                    </div>
                    <div className="ui-field">
                      <label htmlFor={`automation-${selectedAutomation.id}-status`}>Status</label>
                      <select id={`automation-${selectedAutomation.id}-status`} name="status" defaultValue={selectedAutomation.status}>
                        {Object.values(AutomationStatus).map((status) =>
                      <option key={status} value={status}>
                            {enumLabel(status)}
                          </option>
                      )}
                      </select>
                    </div>
                  </EqualGrid>
                  <EqualGrid>
                    <div className="ui-field">
                      <label htmlFor={`automation-${selectedAutomation.id}-trigger`}>Trigger</label>
                      <select id={`automation-${selectedAutomation.id}-trigger`} name="trigger" defaultValue={selectedAutomation.trigger}>
                        {Object.values(AutomationTrigger).map((trigger) =>
                      <option key={trigger} value={trigger}>
                            {enumLabel(trigger)}
                          </option>
                      )}
                      </select>
                    </div>
                    <div className="ui-field">
                      <label htmlFor={`automation-${selectedAutomation.id}-action`}>Action</label>
                      <select id={`automation-${selectedAutomation.id}-action`} name="action" defaultValue={selectedAutomation.action}>
                        {Object.values(AutomationAction).map((action) =>
                      <option key={action} value={action}>
                            {enumLabel(action)}
                          </option>
                      )}
                      </select>
                    </div>
                  </EqualGrid>
                  <EqualGrid>
                    <div className="ui-field">
                      <label htmlFor={`automation-${selectedAutomation.id}-email`}>Target email</label>
                      <input
                      id={`automation-${selectedAutomation.id}-email`}
                      name="targetEmail"
                      type="email"
                      defaultValue={selectedAutomation.targetEmail || ""} />
                    
                    </div>
                    <div className="ui-field">
                      <label htmlFor={`automation-${selectedAutomation.id}-url`}>Webhook URL</label>
                      <input
                      id={`automation-${selectedAutomation.id}-url`}
                      name="webhookUrl"
                      defaultValue={selectedAutomation.webhookUrl || ""}
                      placeholder="https://example.com/webhook" />
                    
                    </div>
                  </EqualGrid>
                  <div className="ui-field">
                    <label htmlFor={`automation-${selectedAutomation.id}-template`}>Email template</label>
                    <select
                    id={`automation-${selectedAutomation.id}-template`}
                    name="messageTemplateId"
                    defaultValue={selectedAutomation.messageTemplateId || ""}>
                    
                      <option value="">No template</option>
                      {messageTemplates.map((template) =>
                    <option key={template.id} value={template.id}>
                          {template.name} ({template.key})
                        </option>
                    )}
                    </select>
                  </div>
                  <div className="ui-field">
                    <label htmlFor={`automation-${selectedAutomation.id}-subject`}>Subject template</label>
                    <input id={`automation-${selectedAutomation.id}-subject`} name="subjectTemplate" defaultValue={selectedAutomation.subjectTemplate} />
                  </div>
                  <div className="ui-field">
                    <label htmlFor={`automation-${selectedAutomation.id}-body`}>Body template</label>
                    <textarea id={`automation-${selectedAutomation.id}-body`} name="bodyTemplate" defaultValue={selectedAutomation.bodyTemplate} />
                  </div>
                  <div className="ui-field">
                    <label htmlFor={`automation-${selectedAutomation.id}-config`}>Action config JSON</label>
                    <textarea
                    id={`automation-${selectedAutomation.id}-config`}
                    name="actionConfig"
                    defaultValue={configTextareaValue(selectedAutomation.actionConfig)} />
                  
                  </div>
                  <EqualGrid>
                    <div className="ui-field">
                      <label htmlFor={`automation-${selectedAutomation.id}-condition-key`}>Simple condition key</label>
                      <input id={`automation-${selectedAutomation.id}-condition-key`} name="conditionKey" defaultValue={condition.key} />
                    </div>
                    <div className="ui-field">
                      <label htmlFor={`automation-${selectedAutomation.id}-condition-value`}>Simple condition value</label>
                      <input id={`automation-${selectedAutomation.id}-condition-value`} name="conditionValue" defaultValue={condition.value} />
                    </div>
                  </EqualGrid>
                  <Button type="submit" variant="secondary">
                    Save automation
                  </Button>
                </form>);

          })()}
            <div className="page-header compact-header">
              <div>
                <h2 className="section-title">{selectedAutomation.name}</h2>
                <p>
                  {enumLabel(selectedAutomation.trigger)} -&gt; {enumLabel(selectedAutomation.action)}
                </p>
              </div>
              <span className={automationStatusClass(selectedAutomation.status)}>{enumLabel(selectedAutomation.status)}</span>
            </div>
            <div className="ui-zero">
              {[AutomationStatus.ACTIVE, AutomationStatus.PAUSED, AutomationStatus.DRAFT].map((status) =>
            <form action={updateAutomationStatusAction} key={status}>
                  <input type="hidden" name="id" value={selectedAutomation.id} />
                  <input type="hidden" name="status" value={status} />
                  <Button type="submit" variant="secondary">
                    Mark {enumLabel(status)}
                  </Button>
                </form>
            )}
            </div>
            <form action={recordAutomationRunAction} className="subpanel form-grid">
              <input type="hidden" name="automationId" value={selectedAutomation.id} />
              <h3 className="subsection-title">Record manual run</h3>
              <EqualGrid>
                <div className="ui-field">
                  <label htmlFor="run-status">Status</label>
                  <select id="run-status" name="status" defaultValue={AutomationRunStatus.SUCCEEDED}>
                    {Object.values(AutomationRunStatus).map((status) =>
                  <option key={status} value={status}>
                        {enumLabel(status)}
                      </option>
                  )}
                  </select>
                </div>
                <div className="ui-field">
                  <label htmlFor="run-key">Trigger key</label>
                  <input id="run-key" name="triggerKey" placeholder="manual-test" />
                </div>
              </EqualGrid>
              <EqualGrid>
                <div className="ui-field">
                  <label htmlFor="run-related-type">Related type</label>
                  <input id="run-related-type" name="relatedType" placeholder="form_submission" />
                </div>
                <div className="ui-field">
                  <label htmlFor="run-related-id">Related id</label>
                  <input id="run-related-id" name="relatedId" />
                </div>
              </EqualGrid>
              <div className="ui-field">
                <label htmlFor="run-summary">Summary</label>
                <input id="run-summary" name="summary" placeholder="Matched rule and queued admin notification." />
              </div>
              <Button type="submit" variant="secondary">
                Record manual run
              </Button>
            </form>
            <form action={deleteAutomationAction} className="subpanel form-grid">
              <input type="hidden" name="id" value={selectedAutomation.id} />
              <label className="ui-zero">
                <input name="confirmDelete" type="checkbox" required />
                Delete this automation and its run records.
              </label>
              <Button type="submit" variant="danger">
                Delete automation
              </Button>
            </form>
          </Card>

          <Card bodyClassName="ui-stack">
            <h2 className="section-title">Run history</h2>
            <Table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Summary</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {selectedAutomation.runs.map((run) =>
              <tr key={run.id}>
                    <td>
                      <span className={runStatusClass(run.status)}>{enumLabel(run.status)}</span>
                      {run.status === AutomationRunStatus.DEAD_LETTER ?
                  <form className="ui-zero" action={replayAutomationRunAction}>
                          <input type="hidden" name="id" value={run.id} />
                          <Button type="submit" variant="secondary">
                            Replay
                          </Button>
                        </form> :
                  null}
                    </td>
                    <td>
                      {run.summary || run.triggerKey || "No summary"}
                      <br />
                      <span className="muted-text">{run.relatedType || "No related record"}</span>
                    </td>
                    <td>{formatDateTime(run.createdAt, settings.timezone)}</td>
                  </tr>
              )}
                {!selectedAutomation.runs.length ?
              <tr>
                    <td colSpan={3}>No runs recorded yet.</td>
                  </tr> :
              null}
              </tbody>
            </Table>
          </Card>
        </EqualGrid> :
      null}

      <EqualGrid as="section">
        <Card action={createWebhookEndpointAction} as="form" minHeight="none" bodyClassName="form-grid">
          <h2 className="section-title">Create webhook endpoint</h2>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="webhook-name">Name</label>
              <input id="webhook-name" name="name" required />
            </div>
            <div className="ui-field">
              <label htmlFor="webhook-status">Status</label>
              <select id="webhook-status" name="status" defaultValue={AutomationStatus.DRAFT}>
                {Object.values(AutomationStatus).map((status) =>
                <option key={status} value={status}>
                    {enumLabel(status)}
                  </option>
                )}
              </select>
            </div>
          </EqualGrid>
          <div className="ui-field">
            <label htmlFor="webhook-url">URL</label>
            <input id="webhook-url" name="url" placeholder="https://example.com/showrunner" required />
          </div>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="webhook-secret">Signing secret</label>
              <input id="webhook-secret" name="signingSecret" placeholder="Generated if left blank" type="password" />
            </div>
            <div className="ui-field">
              <label htmlFor="webhook-events">Events</label>
              <input id="webhook-events" name="events" placeholder={moduleEventNames.join(", ")} />
            </div>
          </EqualGrid>
          <Button type="submit" variant="secondary">
            Add endpoint
          </Button>
        </Card>

        <Card bodyClassName="ui-stack">
          <h2 className="section-title">Webhook endpoints</h2>
          <Table>
            <thead>
              <tr>
                <th>Target</th>
                <th>Events</th>
                <th>State</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((endpoint) =>
              <tr key={endpoint.id}>
                  <td>
                    <strong>{endpoint.name}</strong>
                    <br />
                    <span className="muted-text">{endpoint.url}</span>
                  </td>
                  <td>{stringArrayCsv(endpoint.events) || "No events"}</td>
                  <td>
                    <span className={automationStatusClass(endpoint.status)}>{enumLabel(endpoint.status)}</span>
                  </td>
                  <td>
                    <details>
                      <summary>Edit</summary>
                      <form action={updateWebhookEndpointAction} className="form-grid ui-zero">
                        <input type="hidden" name="id" value={endpoint.id} />
                        <div className="ui-field">
                          <label htmlFor={`webhook-${endpoint.id}-name`}>Name</label>
                          <input id={`webhook-${endpoint.id}-name`} name="name" defaultValue={endpoint.name} required />
                        </div>
                        <div className="ui-field">
                          <label htmlFor={`webhook-${endpoint.id}-url`}>URL</label>
                          <input id={`webhook-${endpoint.id}-url`} name="url" defaultValue={endpoint.url} required />
                        </div>
                        <EqualGrid>
                          <div className="ui-field">
                            <label htmlFor={`webhook-${endpoint.id}-status`}>Status</label>
                            <select id={`webhook-${endpoint.id}-status`} name="status" defaultValue={endpoint.status}>
                              {Object.values(AutomationStatus).map((status) =>
                            <option key={status} value={status}>
                                  {enumLabel(status)}
                                </option>
                            )}
                            </select>
                          </div>
                          <div className="ui-field">
                            <label htmlFor={`webhook-${endpoint.id}-secret`}>Rotate secret</label>
                            <input id={`webhook-${endpoint.id}-secret`} name="signingSecret" placeholder="Leave blank to keep current" type="password" />
                          </div>
                        </EqualGrid>
                        <div className="ui-field">
                          <label htmlFor={`webhook-${endpoint.id}-events`}>Events</label>
                          <input id={`webhook-${endpoint.id}-events`} name="events" defaultValue={stringArrayCsv(endpoint.events)} />
                        </div>
                        <Button type="submit" variant="secondary">
                          Save endpoint
                        </Button>
                      </form>
                      <form action={deleteWebhookEndpointAction} className="form-grid ui-zero">
                        <input type="hidden" name="id" value={endpoint.id} />
                        <label className="ui-zero">
                          <input name="confirmDelete" type="checkbox" required />
                          Delete this endpoint and delivery records.
                        </label>
                        <Button type="submit" variant="danger">
                          Delete endpoint
                        </Button>
                      </form>
                    </details>
                  </td>
                </tr>
              )}
              {!endpoints.length ?
              <tr>
                  <td colSpan={4}>No webhook endpoints yet.</td>
                </tr> :
              null}
            </tbody>
          </Table>
        </Card>
      </EqualGrid>

      <EqualGrid as="section">
        <Card bodyClassName="ui-stack">
          <h2 className="section-title">Automation tasks</h2>
          <Table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Related</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentTasks.map((task) =>
              <tr key={task.id}>
                  <td>
                    <strong>{task.title}</strong>
                    <br />
                    <span className="muted-text">{task.assignedToEmail || task.actorEmail || "Unassigned"}</span>
                  </td>
                  <td>
                    {task.relatedType || "No related record"}
                    <br />
                    <span className="muted-text">{task.relatedId}</span>
                  </td>
                  <td>
                    <span className={runStatusClass(task.status)}>{enumLabel(task.status)}</span>
                  </td>
                </tr>
              )}
              {!recentTasks.length ?
              <tr>
                  <td colSpan={3}>No automation tasks yet.</td>
                </tr> :
              null}
            </tbody>
          </Table>
        </Card>

        <Card action={recordWebhookDeliveryAction} as="form" minHeight="none" bodyClassName="form-grid">
          <h2 className="section-title">Record manual webhook delivery</h2>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="delivery-endpoint">Endpoint</label>
              <select id="delivery-endpoint" name="webhookEndpointId">
                {endpoints.map((endpoint) =>
                <option key={endpoint.id} value={endpoint.id}>
                    {endpoint.name}
                  </option>
                )}
              </select>
            </div>
            <div className="ui-field">
              <label htmlFor="delivery-status">Status</label>
              <select id="delivery-status" name="status" defaultValue={WebhookDeliveryStatus.DELIVERED}>
                {[WebhookDeliveryStatus.DELIVERED, WebhookDeliveryStatus.FAILED].map((status) =>
                <option key={status} value={status}>
                    {enumLabel(status)}
                  </option>
                )}
              </select>
            </div>
          </EqualGrid>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="delivery-event">Event</label>
              <select id="delivery-event" name="event" defaultValue="form.submitted">
                {moduleEventNames.map((event) =>
                <option key={event} value={event}>
                    {event}
                  </option>
                )}
              </select>
            </div>
            <div className="ui-field">
              <label htmlFor="delivery-code">Status code</label>
              <input id="delivery-code" name="statusCode" type="number" min="100" max="599" />
            </div>
          </EqualGrid>
          <div className="ui-field">
            <label htmlFor="delivery-error">Error</label>
            <input id="delivery-error" name="errorMessage" />
          </div>
          <Button type="submit" disabled={!endpoints.length} variant="secondary">
            Record manual delivery
          </Button>
        </Card>

        <Card bodyClassName="ui-stack">
          <h2 className="section-title">Webhook delivery records</h2>
          <Table>
            <thead>
              <tr>
                <th>Target</th>
                <th>Event</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {recentDeliveries.map((delivery) =>
              <tr key={delivery.id}>
                  <td>
                    {delivery.webhookEndpoint?.name || delivery.automation?.name || "Manual delivery"}
                    <br />
                    <span className="muted-text">
                      {delivery.targetUrl || delivery.webhookEndpoint?.url || delivery.automation?.webhookUrl || "No target URL"}
                    </span>
                  </td>
                  <td>{delivery.event}</td>
                  <td>
                    <span className={runStatusClass(delivery.status)}>{enumLabel(delivery.status)}</span>
                  </td>
                  <td>{formatDateTime(delivery.createdAt, settings.timezone)}</td>
                </tr>
              )}
              {!recentDeliveries.length ?
              <tr>
                  <td colSpan={4}>No webhook deliveries recorded yet.</td>
                </tr> :
              null}
            </tbody>
          </Table>
        </Card>
      </EqualGrid>
    </div>);

}
