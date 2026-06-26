import Link from "next/link";
import { ClientPipelineStage, Prisma } from "@prisma/client";
import {
  Activity,
  CalendarCheck,
  Crown,
  CreditCard,
  Download,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  UsersRound
} from "lucide-react";
import { getAccessibleClientWhere, requireAdmin } from "@/lib/auth";
import { clientStatusLabel, clientStatusOptions, defaultClientStatus, normalizeClientStatus } from "@/lib/clients/status";
import { getClientVipSettings, getClientVipSummaries } from "@/lib/clients/vip";
import { enumLabel, formatDateTime, stringArrayFromUnknown } from "@/lib/format";
import { isRecord } from "@/lib/objects";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { Button, ButtonLink, EqualGrid, Pagination, Table, Tooltip } from "@/components/ui";
import {
  createClientAction,
  createClientSegmentAction,
  deleteClientSegmentAction,
  importClientsCsvAction
} from "./actions";
import { ClientRowActions } from "./client-row-actions";
import { ClientsActionModals } from "./clients-action-modals";

export const dynamic = "force-dynamic";

const pageSize = 25;
const clientMetricOptions = [
  { heading: "Appts", id: "appointments", label: "Appointments" },
  { heading: "Orders", id: "orders", label: "Orders" }
] as const;
type ClientMetricId = (typeof clientMetricOptions)[number]["id"];
const defaultClientMetricIds = clientMetricOptions.map((option) => option.id);
const hiddenClientFields = [
  "alternateEmails",
  "alternatePhones",
  "addressLine1",
  "addressLine2",
  "city",
  "region",
  "postalCode",
  "country",
  "timezone",
  "pronouns",
  "photoUrl",
  "birthday",
  "anniversary",
  "preferences",
  "familyName"
];

type ClientsPageProps = {
  searchParams?: Promise<{
    error?: string;
    imported?: string;
    page?: string;
    q?: string;
    metrics?: string | string[];
    saved?: string;
    segment?: string;
    skipped?: string;
    status?: string;
  }>;
};

function numberCriteria(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function segmentWhere(criteria: unknown, now = new Date()): Prisma.ClientWhereInput {
  if (!isRecord(criteria)) return {};

  const where: Prisma.ClientWhereInput = {};
  const status = typeof criteria.status === "string" ? normalizeClientStatus(criteria.status) : undefined;
  const pipelineStage = typeof criteria.pipelineStage === "string" ? criteria.pipelineStage : "";
  const tag = typeof criteria.tag === "string" ? criteria.tag : "";
  const recentPurchaseDays = numberCriteria(criteria.recentPurchaseDays);
  const noRecentActivityDays = numberCriteria(criteria.noRecentActivityDays);

  if (status) where.status = status;
  if (pipelineStage && Object.values(ClientPipelineStage).includes(pipelineStage as ClientPipelineStage)) {
    where.pipelineStage = pipelineStage as ClientPipelineStage;
  }
  if (tag) where.tags = { some: { label: tag.toLowerCase() } };
  if (criteria.pastDue === true) {
    where.billingDocuments = {
      some: { OR: [{ status: "OVERDUE" }, { dueAt: { lt: now }, status: { notIn: ["PAID", "VOID"] } }] }
    };
  }
  if (criteria.upcomingAppointment === true) {
    where.bookings = { some: { startsAt: { gte: now } } };
  }
  if (recentPurchaseDays) {
    where.orders = { some: { createdAt: { gte: new Date(now.getTime() - recentPurchaseDays * 24 * 60 * 60 * 1000) } } };
  }
  if (noRecentActivityDays) {
    const cutoff = new Date(now.getTime() - noRecentActivityDays * 24 * 60 * 60 * 1000);
    where.updatedAt = { lt: cutoff };
    where.bookings = { none: { updatedAt: { gte: cutoff } } };
    where.orders = { none: { updatedAt: { gte: cutoff } } };
    where.notes = { none: { createdAt: { gte: cutoff } } };
  }

  return where;
}

function savedMessage(params: Awaited<NonNullable<ClientsPageProps["searchParams"]>>) {
  if (params.saved === "imported") {
    return `Imported ${Number(params.imported || 0)} clients. Skipped ${Number(params.skipped || 0)} rows or duplicates.`;
  }
  if (params.saved === "portal-link-reissued") return "Client portal link reissued. The previous link no longer works.";
  if (params.saved === "segment-deleted") return "Client filter deleted.";
  if (params.saved) return "Client filter saved.";
  return "";
}

function normalizeMetricIds(value?: string | string[]): ClientMetricId[] {
  if (value === undefined) return [...defaultClientMetricIds];
  const rawValues = Array.isArray(value) ? value : value.split(",");
  return rawValues.filter((item): item is ClientMetricId =>
    clientMetricOptions.some((option) => option.id === item)
  );
}

function usesDefaultMetrics(metricIds: ClientMetricId[]) {
  return metricIds.length === defaultClientMetricIds.length && defaultClientMetricIds.every((id) => metricIds.includes(id));
}

function clientsHref({
  metrics,
  page,
  q,
  segment,
  status
}: {
  metrics?: ClientMetricId[];
  page?: number;
  q?: string;
  segment?: string;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (segment) params.set("segment", segment);
  if (status) params.set("status", status);
  if (metrics && !usesDefaultMetrics(metrics)) {
    if (metrics.length) {
      metrics.forEach((metric) => params.append("metrics", metric));
    } else {
      params.append("metrics", "none");
    }
  }
  if (page && page > 1) params.set("page", String(page));

  const query = params.toString();
  return `/admin/modules/clients${query ? `?${query}` : ""}`;
}

function phoneHref(value: string) {
  const dialable = value.replace(/[^\d+]/g, "");
  return `tel:${dialable || value}`;
}

export default async function ClientsPage({ searchParams }: ClientsPageProps = {}) {
  const params = searchParams ? await searchParams : {};
  const user = await requireAdmin("clients:manage");
  const settings = await getSiteSettings();
  const page = Math.max(1, Number(params.page || 1) || 1);
  const query = String(params.q || "").trim();
  const selectedStatus = normalizeClientStatus(params.status);
  const selectedMetricIds = normalizeMetricIds(params.metrics);
  const activeMetricOptions = clientMetricOptions.filter((option) => selectedMetricIds.includes(option.id));
  const tableColumnCount = activeMetricOptions.length + 6;
  const [segments, vipSettings] = await Promise.all([
    prisma.clientSegment.findMany({
      where: { siteId: settings.siteId },
      orderBy: { name: "asc" }
    }),
    getClientVipSettings(settings.siteId)
  ]);
  const selectedSegment = segments.find((segment) => segment.key === params.segment);
  const baseListFilters: Prisma.ClientWhereInput[] = [];

  if (selectedSegment) baseListFilters.push(segmentWhere(selectedSegment.criteria));
  if (query) {
    baseListFilters.push({
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } },
        { companyName: { contains: query, mode: "insensitive" } },
        { familyName: { contains: query, mode: "insensitive" } },
        { tags: { some: { label: { contains: query.toLowerCase(), mode: "insensitive" } } } }
      ]
    });
  }

  const listFilters = [...baseListFilters];
  if (selectedStatus) listFilters.push({ status: selectedStatus });

  const baseWhere = await getAccessibleClientWhere(
    user,
    settings.siteId,
    baseListFilters.length ? { AND: baseListFilters } : {}
  );
  const where = await getAccessibleClientWhere(
    user,
    settings.siteId,
    listFilters.length ? { AND: listFilters } : {}
  );
  const [clients, clientCount, statusCounts] = await Promise.all([
    prisma.client.findMany({
      where,
      include: {
        _count: { select: { bookings: true, orders: true } },
        bookings: { orderBy: { startsAt: "desc" }, take: 1 },
        tags: { orderBy: { label: "asc" }, take: 6 }
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.client.count({ where }),
    prisma.client.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { _all: true }
    })
  ]);
  const vipSummaries = await getClientVipSummaries({
    clients: clients.map((client) => ({ createdAt: client.createdAt, id: client.id })),
    settings: vipSettings,
    siteId: settings.siteId
  });
  const pageCount = Math.max(1, Math.ceil(clientCount / pageSize));
  const rangeStart = clientCount ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(page * pageSize, clientCount);
  const message = savedMessage(params);
  const baseClientCount = statusCounts.reduce((total, item) => total + item._count._all, 0);
  const statusCount = (status: string) =>
    statusCounts.reduce(
      (total, item) => (normalizeClientStatus(item.status) === status ? total + item._count._all : total),
      0
    );
  const selectedFilterLabel = [selectedSegment?.name, selectedStatus ? clientStatusLabel(selectedStatus) : ""]
    .filter(Boolean)
    .join(" + ");

  const addClientForm = (
    <form action={createClientAction} className="form-grid">
      {hiddenClientFields.map((name) => (
        <input key={name} name={name} type="hidden" value="" />
      ))}
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="client-add-name">Name</label>
          <input id="client-add-name" name="name" required />
        </div>
        <div className="ui-field">
          <label htmlFor="client-add-email">Email</label>
          <input id="client-add-email" name="email" type="email" required />
        </div>
      </EqualGrid>
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="client-add-phone">Phone</label>
          <input id="client-add-phone" name="phone" />
        </div>
        <div className="ui-field">
          <label htmlFor="client-add-company">Company or household</label>
          <input id="client-add-company" name="companyName" />
        </div>
      </EqualGrid>
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="client-add-status">Status</label>
          <select id="client-add-status" name="status" defaultValue={defaultClientStatus}>
            {clientStatusOptions.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>
        <div className="ui-field">
          <label htmlFor="client-add-pipeline">Pipeline</label>
          <select id="client-add-pipeline" name="pipelineStage" defaultValue={ClientPipelineStage.INQUIRY}>
            {Object.values(ClientPipelineStage).map((stage) => (
              <option key={stage} value={stage}>
                {enumLabel(stage)}
              </option>
            ))}
          </select>
        </div>
      </EqualGrid>
      <div className="ui-field">
        <label htmlFor="client-add-tags">Tags</label>
        <input id="client-add-tags" name="tags" placeholder="vip, wedding, retainer" />
      </div>
      <div className="ui-field">
        <label htmlFor="client-add-notes">Private notes</label>
        <textarea id="client-add-notes" name="privateNotes" />
      </div>
      <div className="clients-modal-actions">
        <Button type="submit">
          <Plus size={18} />
          Add client
        </Button>
      </div>
    </form>
  );

  const filtersModal = (
    <div className="clients-filter-layout">
      <section className="clients-modal-section">
        <h3>Saved filters</h3>
        <div className="clients-filter-pills">
          <Link
            className={!selectedSegment ? "ui-button ui-button-sm" : "ui-button ui-button-secondary ui-button-sm"}
            href={clientsHref({ metrics: selectedMetricIds, q: query, status: selectedStatus })}>
            All clients
          </Link>
          {segments.map((segment) => (
            <Link
              className={
                selectedSegment?.id === segment.id
                  ? "ui-button ui-button-sm"
                  : "ui-button ui-button-secondary ui-button-sm"
              }
              href={clientsHref({ metrics: selectedMetricIds, q: query, segment: segment.key, status: selectedStatus })}
              key={segment.id}>
              {segment.name}
            </Link>
          ))}
        </div>
        {selectedSegment ? (
          <form action={deleteClientSegmentAction} className="clients-delete-filter">
            <input type="hidden" name="id" value={selectedSegment.id} />
            <label className="ui-check-row">
              <input name="confirmDelete" type="checkbox" />
              Confirm filter delete
            </label>
            <Button size="sm" type="submit" variant="danger">
              <Trash2 size={15} />
              Delete selected
            </Button>
          </form>
        ) : null}
      </section>

      <form action="/admin/modules/clients" className="clients-modal-section clients-metrics-form">
        <h3>Activity columns</h3>
        {query ? <input type="hidden" name="q" value={query} /> : null}
        {selectedSegment ? <input type="hidden" name="segment" value={selectedSegment.key} /> : null}
        {selectedStatus ? <input type="hidden" name="status" value={selectedStatus} /> : null}
        <input type="hidden" name="metrics" value="none" />
        <p className="ui-muted-flush">Choose which activity metrics appear as individual table columns.</p>
        <div className="clients-check-grid clients-metric-grid">
          {clientMetricOptions.map((option) => (
            <label className="ui-check-row" key={option.id}>
              <input
                defaultChecked={selectedMetricIds.includes(option.id)}
                name="metrics"
                type="checkbox"
                value={option.id}
              />
              {option.label}
            </label>
          ))}
        </div>
        <div className="clients-modal-actions">
          <Button size="sm" type="submit" variant="secondary">
            Apply columns
          </Button>
        </div>
      </form>

      <form action={createClientSegmentAction} className="clients-modal-section clients-filter-form">
        <h3>Create filter</h3>
        <EqualGrid>
          <div className="ui-field">
            <label htmlFor="client-filter-name">Filter name</label>
            <input id="client-filter-name" name="name" required />
          </div>
          <div className="ui-field">
            <label htmlFor="client-filter-tag">Tag</label>
            <input id="client-filter-tag" name="tag" />
          </div>
        </EqualGrid>
        <EqualGrid>
          <div className="ui-field">
            <label htmlFor="client-filter-status">Status</label>
            <select id="client-filter-status" name="status" defaultValue="">
              <option value="">Any status</option>
              {clientStatusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
          <div className="ui-field">
            <label htmlFor="client-filter-stage">Pipeline</label>
            <select id="client-filter-stage" name="pipelineStage" defaultValue="">
              <option value="">Any stage</option>
              {Object.values(ClientPipelineStage).map((stage) => (
                <option key={stage} value={stage}>
                  {enumLabel(stage)}
                </option>
              ))}
            </select>
          </div>
        </EqualGrid>
        <div className="clients-check-grid">
          <label className="ui-check-row">
            <input name="pastDue" type="checkbox" />
            Past due
          </label>
          <label className="ui-check-row">
            <input name="upcomingAppointment" type="checkbox" />
            Upcoming appointment
          </label>
        </div>
        <EqualGrid>
          <div className="ui-field">
            <label htmlFor="client-filter-recent">Recent purchase days</label>
            <input id="client-filter-recent" name="recentPurchaseDays" type="number" min="1" />
          </div>
          <div className="ui-field">
            <label htmlFor="client-filter-stale">No activity days</label>
            <input id="client-filter-stale" name="noRecentActivityDays" type="number" min="1" />
          </div>
        </EqualGrid>
        <div className="clients-modal-actions">
          <Button type="submit" variant="secondary">
            <Save size={16} />
            Save filter
          </Button>
        </div>
      </form>
    </div>
  );

  const dataToolsModal = (
    <div className="form-grid">
      <form action={importClientsCsvAction} className="form-grid" encType="multipart/form-data">
        <div className="ui-field">
          <label htmlFor="client-csv">CSV file</label>
          <input id="client-csv" name="file" type="file" accept=".csv,text/csv" required />
        </div>
        <div className="clients-modal-actions">
          <Button type="submit" variant="secondary">
            <Upload size={16} />
            Import CSV
          </Button>
          <ButtonLink href="/admin/modules/clients/export" variant="secondary">
            <Download size={16} />
            Export all clients
          </ButtonLink>
        </div>
      </form>
    </div>
  );

  return (
    <div className="stack clients-module">
      <header className="page-header">
        <div>
          <p className="eyebrow">Clients</p>
          <h1>Client book</h1>
          <p>Track long-term relationships, appointment history, and private notes.</p>
        </div>
      </header>

      {message ? <div className="success-message">{message}</div> : null}
      {params.error ? <div className="error">{params.error}</div> : null}

      <section aria-labelledby="clients-table-title" className="ui-data-table-shell clients-data-table">
        <div className="ui-data-table-header">
          <div className="ui-data-table-titlebar">
            <div>
              <h2 className="section-title" id="clients-table-title">
                Clients
              </h2>
              <p className="ui-zero">
                {rangeStart}-{rangeEnd} of {clientCount}
                {selectedFilterLabel ? ` filtered by ${selectedFilterLabel}` : " matching clients"}
              </p>
            </div>
            <ClientsActionModals addClient={addClientForm} dataTools={dataToolsModal} filters={filtersModal} />
          </div>

          <div className="ui-data-table-toolbar">
            <form action="/admin/modules/clients" className="clients-search-form ui-data-table-search">
              {selectedSegment ? <input type="hidden" name="segment" value={selectedSegment.key} /> : null}
              {!usesDefaultMetrics(selectedMetricIds)
                ? selectedMetricIds.length
                  ? selectedMetricIds.map((metric) => <input key={metric} type="hidden" name="metrics" value={metric} />)
                  : <input type="hidden" name="metrics" value="none" />
                : null}
              <input aria-label="Search clients" id="clients-search" name="q" placeholder="Search clients" defaultValue={query} />
              <select aria-label="Filter clients by status" id="clients-status-filter" name="status" defaultValue={selectedStatus || ""}>
                <option value="">All statuses</option>
                {clientStatusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
              <Button size="sm" type="submit" variant="secondary">
                <Search size={15} />
                Search
              </Button>
            </form>
          </div>
        </div>

        <Table className="ui-data-table-scroll clients-table-wrap" tableClassName="ui-data-table clients-table">
          <colgroup>
            <col className="clients-col-client" />
            <col className="clients-col-email" />
            <col className="clients-col-phone" />
            {activeMetricOptions.map((metric) => (
              <col className={`clients-col-metric clients-col-metric-${metric.id}`} key={metric.id} />
            ))}
            <col className="clients-col-date" />
            <col className="clients-col-status" />
            <col className="clients-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>Client</th>
              <th>Email</th>
              <th>Phone</th>
              {activeMetricOptions.map((metric) => (
                <th className="clients-metric-heading" key={metric.id}>
                  {metric.heading}
                </th>
              ))}
              <th>Last appointment</th>
              <th>Status</th>
              <th className="clients-actions-heading">Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => {
              const visibleTags = client.tags.slice(0, 3);
              const hiddenTagCount = Math.max(0, client.tags.length - visibleTags.length);
              const vipSummary = vipSummaries.get(client.id);
              const metricCounts: Record<ClientMetricId, number> = {
                appointments: client._count.bookings,
                orders: client._count.orders
              };
              const detailHref = `/admin/clients/${client.id}`;

              return (
                <tr className="clients-clickable-row" key={client.id}>
                  <td>
                    <Link className="clients-row-link clients-primary-cell" href={detailHref}>
                      <span className="clients-name-line">
                        <strong>{client.name}</strong>
                        {vipSummary?.qualifies ? (
                          <Tooltip content={vipSummary.tooltip} focusable={false}>
                            <span aria-label="VIP qualified" className="clients-vip-crown">
                              <Crown aria-hidden="true" size={14} />
                            </span>
                          </Tooltip>
                        ) : null}
                      </span>
                      <span className="muted-text">{client.companyName || client.familyName || "Individual client"}</span>
                      {visibleTags.length ? (
                        <span className="clients-tag-row">
                          {visibleTags.map((tag) => (
                            <span className="ui-badge" key={tag.id}>
                              {tag.label}
                            </span>
                          ))}
                          {hiddenTagCount ? <span className="ui-badge">+{hiddenTagCount}</span> : null}
                        </span>
                      ) : null}
                    </Link>
                  </td>
                  <td className="clients-email-cell">
                    <Link className="clients-row-link" href={detailHref}>
                      <span>{client.email}</span>
                    </Link>
                  </td>
                  <td className="clients-phone-cell">
                    <Link className="clients-row-link" href={detailHref}>
                      <span className={client.phone ? undefined : "muted-text"}>{client.phone || "No phone"}</span>
                    </Link>
                  </td>
                  {activeMetricOptions.map((metric) => (
                    <td className="clients-metric-cell" key={metric.id}>
                      <Link className="clients-row-link" href={detailHref}>
                        <strong>{metricCounts[metric.id]}</strong>
                      </Link>
                    </td>
                  ))}
                  <td>
                    <Link className="clients-row-link" href={detailHref}>
                      {client.bookings[0] ? formatDateTime(client.bookings[0].startsAt, settings.timezone) : "None yet"}
                    </Link>
                  </td>
                  <td>
                    <Link className="clients-row-link clients-status-cell" href={detailHref}>
                      <span className="ui-badge">{clientStatusLabel(client.status)}</span>
                    </Link>
                  </td>
                  <td>
                    <ClientRowActions
                      alternateEmails={stringArrayFromUnknown(client.alternateEmails)}
                      alternatePhones={stringArrayFromUnknown(client.alternatePhones)}
                      detailHref={detailHref}
                      email={client.email}
                      name={client.name}
                      phone={client.phone || ""}
                    />
                  </td>
                </tr>
              );
            })}
            {!clients.length ? (
              <tr>
                <td className="ui-data-table-empty" colSpan={tableColumnCount}>
                  No clients yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </Table>

        <div aria-label="Clients" className="clients-mobile-list">
          {clients.map((client) => {
            const visibleTags = client.tags.slice(0, 3);
            const hiddenTagCount = Math.max(0, client.tags.length - visibleTags.length);
            const vipSummary = vipSummaries.get(client.id);
            const metricCounts: Record<ClientMetricId, number> = {
              appointments: client._count.bookings,
              orders: client._count.orders
            };
            const detailHref = `/admin/clients/${client.id}`;
            const lastAppointment = client.bookings[0] ? formatDateTime(client.bookings[0].startsAt, settings.timezone) : "None yet";

            return (
              <article className="clients-mobile-card" key={client.id}>
                <div className="clients-mobile-card-head">
                  <Link className="clients-mobile-title" href={detailHref}>
                    <span className="clients-name-line">
                      <strong>{client.name}</strong>
                      {vipSummary?.qualifies ? (
                        <Tooltip content={vipSummary.tooltip} focusable={false}>
                          <span aria-label="VIP qualified" className="clients-vip-crown">
                            <Crown aria-hidden="true" size={14} />
                          </span>
                        </Tooltip>
                      ) : null}
                    </span>
                    <span className="muted-text">{client.companyName || client.familyName || "Individual client"}</span>
                  </Link>
                  <span className="ui-badge">{clientStatusLabel(client.status)}</span>
                </div>

                <div className="clients-mobile-contact-grid">
                  <a href={`mailto:${client.email}`}>
                    <span>Email</span>
                    <strong>{client.email}</strong>
                  </a>
                  {client.phone ? (
                    <a href={phoneHref(client.phone)}>
                      <span>Phone</span>
                      <strong>{client.phone}</strong>
                    </a>
                  ) : (
                    <span>
                      <span>Phone</span>
                      <strong>No phone</strong>
                    </span>
                  )}
                </div>

                <Link className="clients-mobile-summary" href={detailHref}>
                  <span>
                    <small>Last appointment</small>
                    <strong>{lastAppointment}</strong>
                  </span>
                  {activeMetricOptions.length ? (
                    <span className="clients-mobile-metrics">
                      {activeMetricOptions.map((metric) => (
                        <span key={metric.id}>
                          <small>{metric.heading}</small>
                          <strong>{metricCounts[metric.id]}</strong>
                        </span>
                      ))}
                    </span>
                  ) : null}
                  {visibleTags.length ? (
                    <span className="clients-tag-row">
                      {visibleTags.map((tag) => (
                        <span className="ui-badge" key={tag.id}>
                          {tag.label}
                        </span>
                      ))}
                      {hiddenTagCount ? <span className="ui-badge">+{hiddenTagCount}</span> : null}
                    </span>
                  ) : null}
                </Link>

                <ClientRowActions
                  alternateEmails={stringArrayFromUnknown(client.alternateEmails)}
                  alternatePhones={stringArrayFromUnknown(client.alternatePhones)}
                  detailHref={detailHref}
                  email={client.email}
                  name={client.name}
                  phone={client.phone || ""}
                />
              </article>
            );
          })}
          {!clients.length ? <p className="clients-mobile-empty">No clients yet.</p> : null}
        </div>

        <div className="ui-data-table-footer">
          <Pagination
            className="clients-pagination"
            label="Client pages"
            nextHref={clientsHref({
              page: Math.min(pageCount, page + 1),
              metrics: selectedMetricIds,
              q: query,
              segment: selectedSegment?.key,
              status: selectedStatus
            })}
            page={page}
            pageCount={pageCount}
            previousHref={clientsHref({
              page: Math.max(1, page - 1),
              metrics: selectedMetricIds,
              q: query,
              segment: selectedSegment?.key,
              status: selectedStatus
            })}
          />
        </div>

        <div className="ui-data-table-stats" aria-label="Client summary">
          <div className="ui-data-table-stat-pill ui-data-table-stat-pill-primary">
            <UsersRound size={16} />
            <strong>{baseClientCount}</strong>
            <span>Clients</span>
          </div>
          <div className="ui-data-table-stat-pill ui-data-table-stat-pill-success">
            <Activity size={16} />
            <strong>{statusCount("active_order")}</strong>
            <span>Active Orders</span>
          </div>
          <div className="ui-data-table-stat-pill ui-data-table-stat-pill-warning">
            <CreditCard size={16} />
            <strong>{statusCount("order_paid")}</strong>
            <span>Paid Orders</span>
          </div>
          <div className="ui-data-table-stat-pill">
            <CalendarCheck size={16} />
            <strong>{statusCount("appointment_booked")}</strong>
            <span>Booked Appts</span>
          </div>
          <div className="ui-data-table-stat-pill">
            <CreditCard size={16} />
            <strong>{statusCount("deposit_paid")}</strong>
            <span>Deposits Paid</span>
          </div>
        </div>
      </section>
    </div>
  );
}
