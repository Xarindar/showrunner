import Link from "next/link";
import { ClientPipelineStage, Prisma } from "@prisma/client";
import { Download, GitMerge, Plus, Save, Trash2, Upload, Users } from "lucide-react";
import { getAccessibleClientWhere, requireAdmin } from "@/lib/auth";
import { clientPortalPath } from "@/lib/clients/portal-token";
import { prisma } from "@/lib/prisma";
import { enumLabel, formatDateTime } from "@/lib/format";
import { isRecord } from "@/lib/objects";
import { getSiteSettings } from "@/lib/site";
import {
  createClientAction,
  createClientSegmentAction,
  deleteClientSegmentAction,
  importClientsCsvAction,
  mergeClientsAction,
  reissueClientPortalLinkAction } from "./actions";
import { Button, ButtonLink, Card, EqualGrid, Table } from "@/components/ui";

export const dynamic = "force-dynamic";

const pageSize = 25;

type ClientsPageProps = {
  searchParams?: Promise<{
    page?: string;
    q?: string;
    error?: string;
    imported?: string;
    saved?: string;
    segment?: string;
    skipped?: string;
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
    where.billingDocuments = { some: { OR: [{ status: "OVERDUE" }, { dueAt: { lt: now }, status: { notIn: ["PAID", "VOID"] } }] } };
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
  if (params.saved === "segment-deleted") return "Client segment deleted.";
  if (params.saved) return "Client segment saved.";
  return "";
}

export default async function ClientsPage({ searchParams }: ClientsPageProps = {}) {
  const params = searchParams ? await searchParams : {};
  const user = await requireAdmin("clients:manage");
  const settings = await getSiteSettings();
  const page = Math.max(1, Number(params.page || 1) || 1);
  const query = String(params.q || "").trim();
  const segments = await prisma.clientSegment.findMany({
    where: { siteId: settings.siteId },
    orderBy: { name: "asc" }
  });
  const selectedSegment = segments.find((segment) => segment.key === params.segment);
  const where: Prisma.ClientWhereInput = await getAccessibleClientWhere(user, settings.siteId, {
    AND: [
    selectedSegment ? segmentWhere(selectedSegment.criteria) : {},
    query ?
    {
      OR: [
      { name: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
      { phone: { contains: query, mode: "insensitive" } },
      { companyName: { contains: query, mode: "insensitive" } },
      { familyName: { contains: query, mode: "insensitive" } },
      { tags: { some: { label: { contains: query.toLowerCase(), mode: "insensitive" } } } }]

    } :
    {}]

  });
  const [clients, clientCount, pipelineCounts, mergeCandidates] = await Promise.all([
  prisma.client.findMany({
    where,
    include: {
      _count: { select: { billingDocuments: true, bookings: true, formSubmissions: true, notes: true, orders: true } },
      tags: { orderBy: { label: "asc" }, take: 6 },
      bookings: { orderBy: { startsAt: "desc" }, take: 1 }
    },
    orderBy: { updatedAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize
  }),
  prisma.client.count({ where }),
  prisma.client.groupBy({
    by: ["pipelineStage"],
    where,
    _count: { _all: true }
  }),
  prisma.client.findMany({
    where: where,
    select: { id: true, name: true, email: true },
    orderBy: { updatedAt: "desc" },
    take: 100
  })]
  );
  const pageCount = Math.max(1, Math.ceil(clientCount / pageSize));
  const message = savedMessage(params);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Clients</p>
          <h1>Client book</h1>
          <p>Track long-term client relationships, appointment history, and private notes.</p>
        </div>
      </header>

      {message ? <div className="success-message">{message}</div> : null}
      {params.error ? <div className="error">{params.error}</div> : null}

      <EqualGrid as="section">
        <Card action={createClientAction} as="form" minHeight="none" bodyClassName="form-grid">
          <h2 className="section-title">Add client</h2>
          {[
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
          "preferences"].
          map((name) =>
          <input key={name} name={name} type="hidden" value="" />
          )}
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" required />
            </div>
            <div className="ui-field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required />
            </div>
          </EqualGrid>
          <div className="ui-field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" />
          </div>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue="lead">
                <option value="lead">Lead</option>
                <option value="active">Active</option>
                <option value="vip">VIP</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="ui-field">
              <label htmlFor="pipelineStage">Pipeline</label>
              <select id="pipelineStage" name="pipelineStage" defaultValue={ClientPipelineStage.INQUIRY}>
                {Object.values(ClientPipelineStage).map((stage) =>
                <option key={stage} value={stage}>
                    {enumLabel(stage)}
                  </option>
                )}
              </select>
            </div>
          </EqualGrid>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="companyName">Company or household</label>
              <input id="companyName" name="companyName" />
            </div>
            <div className="ui-field">
              <label htmlFor="tags">Tags</label>
              <input id="tags" name="tags" placeholder="vip, wedding, retainer" />
            </div>
          </EqualGrid>
          <div className="ui-field">
            <label htmlFor="privateNotes">Private notes</label>
            <textarea id="privateNotes" name="privateNotes" />
          </div>
          <Button type="submit">
            <Plus size={18} />
            Add client
          </Button>
        </Card>

        <Card>
          <Users size={22} />
          <h2 className="section-title">{clientCount} clients</h2>
          <p className="lead lead-compact">
            Public bookings automatically create or update client records by email address.
          </p>
          <div className="ui-zero">
            {Object.values(ClientPipelineStage).map((stage) => {
              const count = pipelineCounts.find((item) => item.pipelineStage === stage)?._count._all || 0;
              return (
                <span className="ui-badge" key={stage}>
                  {enumLabel(stage)}: {count}
                </span>);

            })}
          </div>
        </Card>
      </EqualGrid>

      <EqualGrid as="section">
        <Card minHeight="none" bodyClassName="form-grid">
          <h2 className="section-title">CSV tools</h2>
          <p className="lead lead-compact">
            Import new client records from a mapped header row, or export the full client book for backup and analysis.
          </p>
          <form action={importClientsCsvAction} className="form-grid">
            <div className="ui-field">
              <label htmlFor="client-csv">CSV file</label>
              <input id="client-csv" name="file" type="file" accept=".csv,text/csv" required />
            </div>
            <Button type="submit" variant="secondary">
              <Upload size={16} />
              Import CSV
            </Button>
          </form>
          <ButtonLink href="/admin/modules/clients/export">
            <Download size={16} />
            Export all clients
          </ButtonLink>
        </Card>

        <Card action={mergeClientsAction} as="form" minHeight="none" bodyClassName="form-grid">
          <h2 className="section-title">Merge duplicates</h2>
          <div className="ui-field">
            <label htmlFor="survivorId">Keep this record</label>
            <select id="survivorId" name="survivorId" required>
              <option value="">Choose survivor</option>
              {mergeCandidates.map((client) =>
              <option key={client.id} value={client.id}>
                  {client.name} - {client.email}
                </option>
              )}
            </select>
          </div>
          <div className="ui-field">
            <label htmlFor="duplicateId">Merge and remove this duplicate</label>
            <select id="duplicateId" name="duplicateId" required>
              <option value="">Choose duplicate</option>
              {mergeCandidates.map((client) =>
              <option key={client.id} value={client.id}>
                  {client.name} - {client.email}
                </option>
              )}
            </select>
          </div>
          <label className="ui-zero">
            <input name="confirmMerge" type="checkbox" />
            Confirm duplicate merge
          </label>
          <Button type="submit" variant="secondary">
            <GitMerge size={16} />
            Merge records
          </Button>
        </Card>
      </EqualGrid>

      <EqualGrid as="section">
        <Card bodyClassName="ui-stack">
          <h2 className="section-title">Saved segments</h2>
          <div className="ui-zero">
            <Link className={!selectedSegment ? "ui-button" : "ui-button ui-button-secondary"} href="/admin/modules/clients">
              All clients
            </Link>
            {segments.map((segment) =>
            <Link
              className={selectedSegment?.id === segment.id ? "ui-button" : "ui-button ui-button-secondary"}
              href={`/admin/modules/clients?segment=${encodeURIComponent(segment.key)}`}
              key={segment.id}>
              
                {segment.name}
              </Link>
            )}
          </div>
          {selectedSegment ?
          <form action={deleteClientSegmentAction} className="form-grid">
              <input type="hidden" name="id" value={selectedSegment.id} />
              <label className="ui-zero">
                <input name="confirmDelete" type="checkbox" />
                Confirm segment delete
              </label>
              <Button type="submit" variant="secondary">
                <Trash2 size={16} />
                Delete selected segment
              </Button>
            </form> :
          null}
        </Card>

        <Card action={createClientSegmentAction} as="form" minHeight="none" bodyClassName="form-grid">
          <h2 className="section-title">Save segment</h2>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="segment-name">Name</label>
              <input id="segment-name" name="name" required />
            </div>
            <div className="ui-field">
              <label htmlFor="segment-tag">Tag</label>
              <input id="segment-tag" name="tag" />
            </div>
          </EqualGrid>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="segment-status">Status</label>
              <select id="segment-status" name="status" defaultValue="">
                <option value="">Any status</option>
                <option value="lead">Lead</option>
                <option value="active">Active</option>
                <option value="vip">VIP</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="ui-field">
              <label htmlFor="segment-stage">Pipeline</label>
              <select id="segment-stage" name="pipelineStage" defaultValue="">
                <option value="">Any stage</option>
                {Object.values(ClientPipelineStage).map((stage) =>
                <option key={stage} value={stage}>
                    {enumLabel(stage)}
                  </option>
                )}
              </select>
            </div>
          </EqualGrid>
          <EqualGrid>
            <label className="ui-zero">
              <input name="pastDue" type="checkbox" />
              Past due
            </label>
            <label className="ui-zero">
              <input name="upcomingAppointment" type="checkbox" />
              Upcoming appointment
            </label>
          </EqualGrid>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="segment-recent">Recent purchase days</label>
              <input id="segment-recent" name="recentPurchaseDays" type="number" min="1" />
            </div>
            <div className="ui-field">
              <label htmlFor="segment-stale">No activity days</label>
              <input id="segment-stale" name="noRecentActivityDays" type="number" min="1" />
            </div>
          </EqualGrid>
          <Button type="submit" variant="secondary">
            <Save size={16} />
            Save segment
          </Button>
        </Card>
      </EqualGrid>

      <Card as="section">
        <div className="page-header compact-header">
          <div>
            <h2 className="section-title">Client list</h2>
            <p className="ui-zero">{clientCount} matching clients</p>
          </div>
          <form className="ui-zero" action="/admin/modules/clients">
            {selectedSegment ? <input type="hidden" name="segment" value={selectedSegment.key} /> : null}
            <input aria-label="Search clients" name="q" placeholder="Search clients" defaultValue={query} />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        </div>
        <Table>
          <thead>
            <tr>
              <th>Client</th>
              <th>History</th>
              <th>Last appointment</th>
              <th>Pipeline</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) =>
            <tr key={client.id}>
                <td>
                  <Link href={`/admin/clients/${client.id}`}>
                    <strong>{client.name}</strong>
                  </Link>
                  <br />
                  <span className="muted-text">{client.companyName || client.familyName || client.email}</span>
                  <br />
                  <Link className="ui-zero"
                href={clientPortalPath({
                  clientId: client.id,
                  email: client.email,
                  portalAccessVersion: client.portalAccessVersion,
                  siteId: settings.siteId
                })}>
                    Client portal
                  </Link>
                  <form className="ui-zero" action={reissueClientPortalLinkAction}>
                    <input name="clientId" type="hidden" value={client.id} />
                    <Button type="submit" variant="secondary">
                      Reissue portal link
                    </Button>
                  </form>
                  <br />
                  {client.tags.map((tag) =>
                <span className="ui-badge ui-zero" key={tag.id}>
                      {tag.label}
                    </span>
                )}
                </td>
                <td>
                  {client._count.bookings} appointments, {client._count.orders} orders, {client._count.billingDocuments} billing docs
                  <br />
                  <span className="muted-text">
                    {client._count.formSubmissions} forms, {client._count.notes} notes
                  </span>
                </td>
                <td>{client.bookings[0] ? formatDateTime(client.bookings[0].startsAt, settings.timezone) : "None yet"}</td>
                <td>
                  <span className="ui-badge">{client.status}</span>
                  <br />
                  <span className="ui-badge">{enumLabel(client.pipelineStage)}</span>
                </td>
              </tr>
            )}
            {!clients.length ?
            <tr>
                <td colSpan={4}>No clients yet.</td>
              </tr> :
            null}
          </tbody>
        </Table>
        <div className="ui-zero">
          <ButtonLink
            aria-disabled={page <= 1}

            href={`/admin/modules/clients?q=${encodeURIComponent(query)}&segment=${encodeURIComponent(params.segment || "")}&page=${Math.max(1, page - 1)}`} variant="secondary">
            
            Previous
          </ButtonLink>
          <span className="ui-badge">
            Page {Math.min(page, pageCount)} of {pageCount}
          </span>
          <ButtonLink
            aria-disabled={page >= pageCount}

            href={`/admin/modules/clients?q=${encodeURIComponent(query)}&segment=${encodeURIComponent(params.segment || "")}&page=${Math.min(pageCount, page + 1)}`} variant="secondary">
            
            Next
          </ButtonLink>
        </div>
      </Card>
    </div>);

}
