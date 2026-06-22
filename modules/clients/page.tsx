import Link from "next/link";
import { ClientPipelineStage, Prisma } from "@prisma/client";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Plus,
  RefreshCw,
  Save,
  Search,
  Star,
  Trash2,
  Upload,
  UserPlus,
  UsersRound
} from "lucide-react";
import { getAccessibleClientWhere, requireAdmin } from "@/lib/auth";
import { clientPortalPath } from "@/lib/clients/portal-token";
import { enumLabel, formatDateTime } from "@/lib/format";
import { isRecord } from "@/lib/objects";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { Button, ButtonLink, EqualGrid, Table } from "@/components/ui";
import {
  createClientAction,
  createClientSegmentAction,
  deleteClientSegmentAction,
  importClientsCsvAction,
  reissueClientPortalLinkAction
} from "./actions";
import { ClientsActionModals } from "./clients-action-modals";

export const dynamic = "force-dynamic";

const pageSize = 25;
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
    saved?: string;
    segment?: string;
    skipped?: string;
    stage?: string;
  }>;
};

function numberCriteria(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function segmentWhere(criteria: unknown, now = new Date()): Prisma.ClientWhereInput {
  if (!isRecord(criteria)) return {};

  const where: Prisma.ClientWhereInput = {};
  const status = typeof criteria.status === "string" ? criteria.status : "";
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

function selectedPipelineStage(value?: string) {
  return value && Object.values(ClientPipelineStage).includes(value as ClientPipelineStage)
    ? (value as ClientPipelineStage)
    : undefined;
}

function tableLabel(value: string) {
  const label = enumLabel(value);
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function clientsHref({
  page,
  q,
  segment,
  stage
}: {
  page?: number;
  q?: string;
  segment?: string;
  stage?: ClientPipelineStage;
}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (segment) params.set("segment", segment);
  if (stage) params.set("stage", stage);
  if (page && page > 1) params.set("page", String(page));

  const query = params.toString();
  return `/admin/modules/clients${query ? `?${query}` : ""}`;
}

export default async function ClientsPage({ searchParams }: ClientsPageProps = {}) {
  const params = searchParams ? await searchParams : {};
  const user = await requireAdmin("clients:manage");
  const settings = await getSiteSettings();
  const page = Math.max(1, Number(params.page || 1) || 1);
  const query = String(params.q || "").trim();
  const selectedStage = selectedPipelineStage(params.stage);
  const segments = await prisma.clientSegment.findMany({
    where: { siteId: settings.siteId },
    orderBy: { name: "asc" }
  });
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
  if (selectedStage) listFilters.push({ pipelineStage: selectedStage });

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
  const [clients, clientCount, pipelineCounts, statusCounts] = await Promise.all([
    prisma.client.findMany({
      where,
      include: {
        _count: { select: { billingDocuments: true, bookings: true, formSubmissions: true, notes: true, orders: true } },
        bookings: { orderBy: { startsAt: "desc" }, take: 1 },
        tags: { orderBy: { label: "asc" }, take: 6 }
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.client.count({ where }),
    prisma.client.groupBy({
      by: ["pipelineStage"],
      where: baseWhere,
      _count: { _all: true }
    }),
    prisma.client.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { _all: true }
    })
  ]);
  const pageCount = Math.max(1, Math.ceil(clientCount / pageSize));
  const rangeStart = clientCount ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(page * pageSize, clientCount);
  const message = savedMessage(params);
  const pipelineCount = (stage: ClientPipelineStage) =>
    pipelineCounts.find((item) => item.pipelineStage === stage)?._count._all || 0;
  const baseClientCount = pipelineCounts.reduce((total, item) => total + item._count._all, 0);
  const statusCount = (status: string) =>
    statusCounts.find((item) => item.status.toLowerCase() === status)?._count._all || 0;
  const selectedFilterLabel = [selectedSegment?.name, selectedStage ? tableLabel(selectedStage) : ""]
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
          <select id="client-add-status" name="status" defaultValue="lead">
            <option value="lead">Lead</option>
            <option value="active">Active</option>
            <option value="vip">VIP</option>
            <option value="inactive">Inactive</option>
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
            href={clientsHref({ q: query, stage: selectedStage })}>
            All clients
          </Link>
          {segments.map((segment) => (
            <Link
              className={
                selectedSegment?.id === segment.id
                  ? "ui-button ui-button-sm"
                  : "ui-button ui-button-secondary ui-button-sm"
              }
              href={clientsHref({ q: query, segment: segment.key, stage: selectedStage })}
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
              <option value="lead">Lead</option>
              <option value="active">Active</option>
              <option value="vip">VIP</option>
              <option value="inactive">Inactive</option>
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

          <div className="ui-data-table-tabs" aria-label="Pipeline stages">
            <Link
              className={`ui-data-table-tab${!selectedStage ? " is-active" : ""}`}
              href={clientsHref({ q: query, segment: selectedSegment?.key })}>
              All
              <span>{baseClientCount}</span>
            </Link>
            {Object.values(ClientPipelineStage).map((stage) => (
              <Link
                className={`ui-data-table-tab${selectedStage === stage ? " is-active" : ""}`}
                href={clientsHref({ q: query, segment: selectedSegment?.key, stage })}
                key={stage}>
                {tableLabel(stage)}
                <span>{pipelineCount(stage)}</span>
              </Link>
            ))}
          </div>

          <div className="ui-data-table-toolbar">
            <form action="/admin/modules/clients" className="clients-search-form ui-data-table-search">
              {selectedSegment ? <input type="hidden" name="segment" value={selectedSegment.key} /> : null}
              {selectedStage ? <input type="hidden" name="stage" value={selectedStage} /> : null}
              <input aria-label="Search clients" id="clients-search" name="q" placeholder="Search clients" defaultValue={query} />
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
            <col className="clients-col-contact" />
            <col className="clients-col-activity" />
            <col className="clients-col-date" />
            <col className="clients-col-status" />
            <col className="clients-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>Client</th>
              <th>Contact</th>
              <th>Activity</th>
              <th>Last appointment</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => {
              const visibleTags = client.tags.slice(0, 3);
              const hiddenTagCount = Math.max(0, client.tags.length - visibleTags.length);
              const portalHref = clientPortalPath({
                clientId: client.id,
                email: client.email,
                portalAccessVersion: client.portalAccessVersion,
                siteId: settings.siteId
              });

              return (
                <tr key={client.id}>
                  <td>
                    <div className="clients-primary-cell">
                      <Link href={`/admin/clients/${client.id}`}>
                        <strong>{client.name}</strong>
                      </Link>
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
                    </div>
                  </td>
                  <td>
                    <div className="clients-contact-cell">
                      <span>{client.email}</span>
                      <span className="muted-text">{client.phone || "No phone"}</span>
                    </div>
                  </td>
                  <td>
                    <div className="clients-activity-cell">
                      <span>{client._count.bookings} appts</span>
                      <span>{client._count.orders} orders</span>
                      <span>{client._count.billingDocuments} docs</span>
                      <span className="muted-text">
                        {client._count.formSubmissions} forms, {client._count.notes} notes
                      </span>
                    </div>
                  </td>
                  <td>{client.bookings[0] ? formatDateTime(client.bookings[0].startsAt, settings.timezone) : "None yet"}</td>
                  <td>
                    <div className="clients-status-cell">
                      <span className="ui-badge">{client.status}</span>
                      <span className="ui-badge">{enumLabel(client.pipelineStage)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="clients-row-actions">
                      <ButtonLink href={`/admin/clients/${client.id}`} size="sm" variant="secondary">
                        Open
                      </ButtonLink>
                      <ButtonLink href={portalHref} size="sm" variant="ghost">
                        <ExternalLink size={15} />
                        Portal
                      </ButtonLink>
                      <form action={reissueClientPortalLinkAction}>
                        <input name="clientId" type="hidden" value={client.id} />
                        <Button
                          aria-label={`Reissue portal link for ${client.name}`}
                          className="clients-icon-button"
                          size="sm"
                          title="Reissue portal link"
                          type="submit"
                          variant="ghost">
                          <RefreshCw size={15} />
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!clients.length ? (
              <tr>
                <td className="ui-data-table-empty" colSpan={6}>
                  No clients yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </Table>

        <div className="ui-data-table-footer">
          <div className="clients-pagination">
            <ButtonLink
              aria-disabled={page <= 1}
              href={clientsHref({
                page: Math.max(1, page - 1),
                q: query,
                segment: selectedSegment?.key,
                stage: selectedStage
              })}
              size="sm"
              variant="secondary">
              <ChevronLeft size={15} />
              Previous
            </ButtonLink>
            <span className="ui-badge">
              Page {Math.min(page, pageCount)} of {pageCount}
            </span>
            <ButtonLink
              aria-disabled={page >= pageCount}
              href={clientsHref({
                page: Math.min(pageCount, page + 1),
                q: query,
                segment: selectedSegment?.key,
                stage: selectedStage
              })}
              size="sm"
              variant="secondary">
              Next
              <ChevronRight size={15} />
            </ButtonLink>
          </div>
        </div>

        <div className="ui-data-table-stats" aria-label="Client summary">
          <div className="ui-data-table-stat-pill ui-data-table-stat-pill-primary">
            <UsersRound size={16} />
            <strong>{baseClientCount}</strong>
            <span>Clients</span>
          </div>
          <div className="ui-data-table-stat-pill ui-data-table-stat-pill-success">
            <Activity size={16} />
            <strong>{statusCount("active")}</strong>
            <span>Active</span>
          </div>
          <div className="ui-data-table-stat-pill ui-data-table-stat-pill-warning">
            <Star size={16} />
            <strong>{statusCount("vip")}</strong>
            <span>VIP</span>
          </div>
          <div className="ui-data-table-stat-pill">
            <UserPlus size={16} />
            <strong>{statusCount("lead")}</strong>
            <span>Leads</span>
          </div>
        </div>
      </section>
    </div>
  );
}
