import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientPipelineStage, EmailOutboxStatus, MessageLogStatus, type Prisma } from "@prisma/client";
import { CalendarCheck, GitMerge, Save, Search } from "lucide-react";
import { getAccessibleClientWhere, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enumLabel, formatDateTime, formatMoney, stringArrayCsv, stringArrayFromUnknown } from "@/lib/format";
import { isRecord } from "@/lib/objects";
import { getSiteSettings } from "@/lib/site";
import {
  addClientFileAction,
  addClientNoteAction,
  deleteClientFileAction,
  deleteClientNoteAction,
  mergeClientsAction,
  updateClientAction } from "../actions";
import { Button, ButtonLink, Card, EqualGrid, Table } from "@/components/ui";
import { ModuleActionModals } from "@/components/ui/module-action-modals";

export const dynamic = "force-dynamic";

type ClientDetailPageProps = {
  params: Promise<{id: string;}>;
  searchParams: Promise<{saved?: string;error?: string;merge?: string;mergeSearch?: string;}>;
};

type TimelineItem = {
  id: string;
  at: Date;
  badge: string;
  title: string;
  detail: string;
  href?: string;
};

type ClientMergeCandidate = {
  _count: {
    billingDocuments: number;
    bookings: number;
    formSubmissions: number;
    notes: number;
    orders: number;
  };
  companyName: string;
  email: string;
  familyName: string;
  id: string;
  name: string;
  phone: string | null;
  updatedAt: Date;
};

const mergeCandidateSelect = {
  _count: { select: { billingDocuments: true, bookings: true, formSubmissions: true, notes: true, orders: true } },
  companyName: true,
  email: true,
  familyName: true,
  id: true,
  name: true,
  phone: true,
  updatedAt: true
} satisfies Prisma.ClientSelect;

function truncate(value: string, length = 140) {
  return value.length > length ? `${value.slice(0, length - 1)}...` : value;
}

function dateInputValue(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function preferencesNotes(value: unknown) {
  return isRecord(value) && typeof value.notes === "string" ? value.notes : "";
}

function mergeCandidateSearchFilter(query: string): Prisma.ClientWhereInput {
  const value = query.trim();
  if (!value) return {};

  return {
    OR: [
      { name: { contains: value, mode: "insensitive" } },
      { email: { contains: value, mode: "insensitive" } },
      { phone: { contains: value, mode: "insensitive" } },
      { companyName: { contains: value, mode: "insensitive" } },
      { familyName: { contains: value, mode: "insensitive" } },
      { tags: { some: { label: { contains: value.toLowerCase(), mode: "insensitive" } } } }
    ]
  };
}

function candidateContext(candidate: ClientMergeCandidate) {
  return candidate.companyName || candidate.familyName || candidate.phone || "Individual client";
}

function clientEmailSet(client: {alternateEmails: unknown;email: string;}) {
  return [...new Set([client.email, ...stringArrayFromUnknown(client.alternateEmails)].map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

function emailOutboxStatusClass(status: EmailOutboxStatus) {
  if (status === EmailOutboxStatus.SENT) return "ui-badge ui-badge-success";
  if (status === EmailOutboxStatus.FAILED || status === EmailOutboxStatus.SUPPRESSED || status === EmailOutboxStatus.CANCELED) {
    return "ui-badge ui-badge-danger";
  }
  return "ui-badge";
}

function messageLogStatusClass(status: MessageLogStatus) {
  if (status === MessageLogStatus.SENT) return "ui-badge ui-badge-success";
  if (status === MessageLogStatus.FAILED || status === MessageLogStatus.SUPPRESSED) return "ui-badge ui-badge-danger";
  return "ui-badge";
}

function relatedRecordHref(type: string, id: string) {
  if (!type || !id) return "";
  if (type === "booking") return `/admin/appointments/${id}`;
  if (type === "order") return `/admin/modules/products?order=${encodeURIComponent(id)}`;
  if (type === "billingDocument") return `/admin/modules/billing?document=${encodeURIComponent(id)}`;
  if (type === "formSubmission" || type === "form_submission") return `/admin/modules/forms`;
  return "";
}

function relatedRecordLabel(type: string, id: string) {
  if (!type || !id) return "None";
  return `${type} ${id.slice(0, 8)}`;
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
  slice(0, 3);

  return entries.length ? truncate(entries.map(([key, item]) => `${key}: ${String(item)}`).join(" | ")) : "No response data";
}

export default async function ClientDetailPage({ params, searchParams }: ClientDetailPageProps) {
  const [{ id }, queryParams] = await Promise.all([params, searchParams]);
  const { saved, error } = queryParams;
  const mergeSearch = String(queryParams.mergeSearch || "").trim();
  const openMergeModal = queryParams.merge === "1" || Boolean(mergeSearch);
  const user = await requireAdmin("clients:manage");
  const settings = await getSiteSettings();
  const client = await prisma.client.findFirst({
    where: await getAccessibleClientWhere(user, settings.siteId, { id }),
    include: {
      tags: { orderBy: { label: "asc" } },
      files: { orderBy: { uploadedAt: "desc" }, take: 40 },
      notes: { orderBy: { createdAt: "desc" } },
      bookings: {
        include: { service: true },
        orderBy: { startsAt: "desc" },
        take: 40
      },
      formSubmissions: {
        include: { form: { select: { id: true, name: true, slug: true, destination: true } } },
        orderBy: { createdAt: "desc" },
        take: 40
      },
      testimonials: {
        orderBy: { submittedAt: "desc" },
        take: 40
      },
      billingDocuments: {
        orderBy: { updatedAt: "desc" },
        take: 40
      },
      orders: {
        include: { payments: true },
        orderBy: { updatedAt: "desc" },
        take: 20
      },
      messageLogs: {
        include: { template: { select: { name: true, purpose: true } } },
        orderBy: { createdAt: "desc" },
        take: 40
      }
    }
  });

  if (!client) notFound();

  const clientEmails = clientEmailSet(client);
  const bookingIds = client.bookings.map((booking) => booking.id);
  const orderIds = client.orders.map((order) => order.id);
  const billingDocumentIds = client.billingDocuments.map((document) => document.id);
  const formSubmissionIds = client.formSubmissions.map((submission) => submission.id);
  const relatedOutboxFilters: Array<{relatedType: string;relatedId: {in: string[];};}> = [];
  if (bookingIds.length) relatedOutboxFilters.push({ relatedType: "booking", relatedId: { in: bookingIds } });
  if (orderIds.length) relatedOutboxFilters.push({ relatedType: "order", relatedId: { in: orderIds } });
  if (billingDocumentIds.length) relatedOutboxFilters.push({ relatedType: "billingDocument", relatedId: { in: billingDocumentIds } });
  if (formSubmissionIds.length) {
    relatedOutboxFilters.push({ relatedType: "formSubmission", relatedId: { in: formSubmissionIds } });
    relatedOutboxFilters.push({ relatedType: "form_submission", relatedId: { in: formSubmissionIds } });
  }

  const [exactMergeWhere, searchedMergeWhere] = await Promise.all([
    getAccessibleClientWhere(user, settings.siteId, {
      id: { not: client.id },
      name: { equals: client.name, mode: "insensitive" }
    }),
    mergeSearch
      ? getAccessibleClientWhere(user, settings.siteId, {
          id: { not: client.id },
          ...mergeCandidateSearchFilter(mergeSearch)
        })
      : Promise.resolve(null)
  ]);

  const [
    galleryAccesses,
    galleryFavorites,
    proofApprovals,
    proofDecisions,
    emailOutboxRows,
    exactMergeCandidates,
    searchedMergeCandidates
  ] = await Promise.all([
  prisma.portfolioGalleryAccess.findMany({
    where: { siteId: settings.siteId, clientId: client.id },
    include: { gallery: { select: { slug: true, title: true } } },
    orderBy: { updatedAt: "desc" },
    take: 20
  }),
  prisma.portfolioGalleryFavorite.findMany({
    where: { clientId: client.id },
    include: {
      gallery: { select: { slug: true, title: true } },
      item: { select: { title: true, imageUrl: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 30
  }),
  prisma.portfolioProofApproval.findMany({
    where: { siteId: settings.siteId, clientId: client.id },
    include: { gallery: { select: { slug: true, title: true } }, round: { select: { roundNumber: true } } },
    orderBy: { createdAt: "desc" },
    take: 20
  }),
  prisma.portfolioProofItemDecision.findMany({
    where: { siteId: settings.siteId, clientId: client.id },
    include: {
      gallery: { select: { slug: true, title: true } },
      item: { select: { title: true, imageUrl: true } },
      round: { select: { roundNumber: true } }
    },
    orderBy: { updatedAt: "desc" },
    take: 30
  }),
  prisma.emailOutbox.findMany({
    where: {
      siteId: settings.siteId,
      OR: [{ recipientEmail: { in: clientEmails } }, ...relatedOutboxFilters]
    },
    include: { template: { select: { name: true, key: true, purpose: true } } },
    orderBy: { createdAt: "desc" },
    take: 80
  }),
  prisma.client.findMany({
    where: exactMergeWhere,
    orderBy: { updatedAt: "desc" },
    select: mergeCandidateSelect,
    take: 20
  }),
  searchedMergeWhere
    ? prisma.client.findMany({
        where: searchedMergeWhere,
        orderBy: { updatedAt: "desc" },
        select: mergeCandidateSelect,
        take: 50
      })
    : Promise.resolve([])]
  );

  const mergeCandidateMap = new Map<string, ClientMergeCandidate & { matchLabel: string }>();
  exactMergeCandidates.forEach((candidate) => {
    mergeCandidateMap.set(candidate.id, { ...candidate, matchLabel: "Exact name match" });
  });
  searchedMergeCandidates.forEach((candidate) => {
    if (!mergeCandidateMap.has(candidate.id)) {
      mergeCandidateMap.set(candidate.id, { ...candidate, matchLabel: "Search result" });
    }
  });
  const mergeCandidates = Array.from(mergeCandidateMap.values());

  const timelineItems: TimelineItem[] = [
  {
    id: `profile-${client.id}`,
    at: client.updatedAt,
    badge: "profile",
    title: "Profile status",
    detail: `${client.status} | ${enumLabel(client.pipelineStage)}`
  },
  ...client.bookings.map((booking) => ({
    id: `booking-${booking.id}`,
    at: booking.startsAt,
    badge: "appointment",
    title: booking.service.name,
    detail: `${enumLabel(booking.status)} | ${formatDateTime(booking.startsAt, settings.timezone)}`,
    href: `/admin/appointments/${booking.id}`
  })),
  ...client.notes.map((note) => ({
    id: `note-${note.id}`,
    at: note.createdAt,
    badge: "note",
    title: "Internal note",
    detail: truncate(note.content)
  })),
  ...client.formSubmissions.map((submission) => ({
    id: `form-${submission.id}`,
    at: submission.createdAt,
    badge: "form",
    title: submission.form.name,
    detail: `${enumLabel(submission.form.destination)} | ${summarizeSubmission(submission.data)}`,
    href: `/admin/modules/forms?form=${submission.formId}`
  })),
  ...client.testimonials.map((testimonial) => ({
    id: `testimonial-${testimonial.id}`,
    at: testimonial.submittedAt,
    badge: "testimonial",
    title: testimonial.serviceName || "Testimonial",
    detail: `${enumLabel(testimonial.status)} | ${testimonial.rating}/5 | ${truncate(testimonial.quote)}`,
    href: `/admin/modules/testimonials?status=${testimonial.status.toLowerCase()}`
  })),
  ...client.billingDocuments.map((document) => ({
    id: `billing-${document.id}`,
    at: document.updatedAt,
    badge: enumLabel(document.type),
    title: document.documentNumber,
    detail: `${enumLabel(document.status)} | ${formatMoney(document.totalCents, document.currency)}`,
    href: `/admin/modules/billing?document=${document.id}`
  })),
  ...client.orders.map((order) => ({
    id: `order-${order.id}`,
    at: order.placedAt || order.updatedAt,
    badge: "order",
    title: order.orderNumber,
    detail: `${enumLabel(order.status)} | ${formatMoney(order.totalCents, order.currency)}`,
    href: `/admin/modules/products?order=${order.id}`
  })),
  ...client.orders.flatMap((order) =>
  order.payments.map((payment) => ({
    id: `payment-${payment.id}`,
    at: payment.createdAt,
    badge: "payment",
    title: `${enumLabel(payment.status)} payment`,
    detail: `${formatMoney(payment.amountCents, payment.currency)} | ${enumLabel(payment.provider)}`,
    href: `/admin/modules/products?order=${order.id}`
  }))
  ),
  ...client.messageLogs.map((message) => ({
    id: `message-${message.id}`,
    at: message.sentAt || message.createdAt,
    badge: message.channel.toLowerCase(),
    title: message.subject || message.template?.name || message.purpose,
    detail: `${enumLabel(message.status)} | ${truncate(message.bodyPreview || message.recipientEmail || "No preview")}`
  })),
  ...emailOutboxRows.map((message) => ({
    id: `email-outbox-${message.id}`,
    at: message.sentAt || message.updatedAt,
    badge: "email",
    title: message.subject || message.template?.name || message.templateKey,
    detail: `${enumLabel(message.status)} | ${message.recipientEmail}`
  })),
  ...client.files.map((file) => ({
    id: `file-${file.id}`,
    at: file.uploadedAt,
    badge: "upload",
    title: file.title,
    detail: `${file.category || "file"} | ${truncate(file.notes || file.url)}`,
    href: file.url
  })),
  ...galleryAccesses.map((access) => ({
    id: `gallery-access-${access.id}`,
    at: access.lastViewedAt || access.createdAt,
    badge: "gallery access",
    title: access.gallery.title,
    detail: `${enumLabel(access.status)} | ${access.recipientEmail}`,
    href: `/galleries/access/${access.accessToken}`
  })),
  ...galleryFavorites.map((favorite) => ({
    id: `gallery-favorite-${favorite.id}`,
    at: favorite.createdAt,
    badge: "favorite",
    title: favorite.gallery.title,
    detail: `${favorite.item.title || favorite.item.imageUrl} | ${truncate(favorite.notes || "No notes")}`,
    href: `/galleries/${favorite.gallery.slug}`
  })),
  ...proofApprovals.map((approval) => ({
    id: `proof-approval-${approval.id}`,
    at: approval.createdAt,
    badge: "proof response",
    title: approval.gallery.title,
    detail: `Round ${approval.round.roundNumber} | ${enumLabel(approval.status)} | ${truncate(approval.notes || "No notes")}`,
    href: `/galleries/${approval.gallery.slug}`
  })),
  ...proofDecisions.map((decision) => ({
    id: `proof-decision-${decision.id}`,
    at: decision.updatedAt,
    badge: "proof image",
    title: decision.gallery.title,
    detail: `Round ${decision.round.roundNumber} | ${enumLabel(decision.status)} | ${decision.item.title || decision.item.imageUrl}`,
    href: `/galleries/${decision.gallery.slug}`
  }))].

  sort((first, second) => second.at.getTime() - first.at.getTime()).
  slice(0, 80);

  const savedMessage = saved === "merged" ? "Client records merged." : saved ? "Client record updated." : "";
  const mergeClientModal = (
    <div className="form-grid">
      <div className="subpanel">
        <span className="ui-badge ui-badge-success">Keeping</span>
        <h3 className="ui-title-tight">{client.name}</h3>
        <p className="ui-zero">{client.email}</p>
      </div>

      <form action={`/admin/clients/${client.id}`} className="clients-search-form">
        <input name="merge" type="hidden" value="1" />
        <input
          aria-label="Search client merge candidates"
          id="client-merge-search"
          name="mergeSearch"
          placeholder="Search all clients"
          defaultValue={mergeSearch}
        />
        <Button size="sm" type="submit" variant="secondary">
          <Search size={15} />
          Search
        </Button>
        {mergeSearch ? (
          <ButtonLink href={`/admin/clients/${client.id}?merge=1`} size="sm" variant="ghost">
            Clear
          </ButtonLink>
        ) : null}
      </form>

      <form action={mergeClientsAction} className="form-grid">
        <input name="survivorId" type="hidden" value={client.id} />
        <div className="ui-field">
          <label>Duplicate to merge into this client</label>
          <div className="stack">
            {mergeCandidates.map((candidate) => (
              <label className="subpanel ui-check-row" key={candidate.id}>
                <input
                  aria-label={`Merge ${candidate.name} into ${client.name}`}
                  name="duplicateId"
                  required
                  type="radio"
                  value={candidate.id}
                />
                <span className="ui-stack ui-gap-2 ui-min-0">
                  <span className="ui-inline-actions">
                    <strong>{candidate.name}</strong>
                    <span className={candidate.matchLabel === "Exact name match" ? "ui-badge ui-badge-success" : "ui-badge"}>
                      {candidate.matchLabel}
                    </span>
                  </span>
                  <span className="muted-text">
                    {candidate.email}
                    {candidate.phone ? ` | ${candidate.phone}` : ""}
                  </span>
                  <span className="muted-text">
                    {candidateContext(candidate)} | Updated {formatDateTime(candidate.updatedAt, settings.timezone)}
                  </span>
                  <span className="ui-inline-actions">
                    <span className="ui-badge">{candidate._count.bookings} appts</span>
                    <span className="ui-badge">{candidate._count.orders} orders</span>
                    <span className="ui-badge">{candidate._count.billingDocuments} docs</span>
                    <span className="ui-badge">
                      {candidate._count.formSubmissions} forms, {candidate._count.notes} notes
                    </span>
                  </span>
                </span>
              </label>
            ))}
            {!mergeCandidates.length ? (
              <div className="empty-state">
                {mergeSearch ? "No clients matched that search." : "No exact name matches. Search all clients for another record."}
              </div>
            ) : null}
          </div>
        </div>
        <label className="ui-check-row">
          <input name="confirmMerge" type="checkbox" />
          Confirm duplicate merge
        </label>
        <div className="module-modal-actions">
          <Button disabled={!mergeCandidates.length} type="submit" variant="secondary">
            <GitMerge size={16} />
            Merge records
          </Button>
        </div>
      </form>
    </div>
  );

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Client</p>
          <h1>{client.name}</h1>
          <p>{client.email}</p>
        </div>
        <div className="module-card-header-actions">
          <ModuleActionModals
            initialActiveId={openMergeModal ? "merge" : undefined}
            items={[
              {
                content: mergeClientModal,
                icon: "merge",
                id: "merge",
                label: "Merge",
                title: "Merge client"
              }
            ]}
            toolbarLabel="Client record tools"
          />
          <ButtonLink href="/admin/modules/clients" variant="secondary">
            Back to clients
          </ButtonLink>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <EqualGrid as="section">
        <Card action={updateClientAction} as="form" minHeight="none" bodyClassName="form-grid">
          <input type="hidden" name="id" value={client.id} />
          <h2 className="section-title">Profile</h2>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" defaultValue={client.name} required />
            </div>
            <div className="ui-field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" defaultValue={client.email} required />
            </div>
          </EqualGrid>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="companyName">Company</label>
              <input id="companyName" name="companyName" defaultValue={client.companyName} />
            </div>
            <div className="ui-field">
              <label htmlFor="familyName">Family or household</label>
              <input id="familyName" name="familyName" defaultValue={client.familyName} />
            </div>
          </EqualGrid>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="phone">Phone</label>
              <input id="phone" name="phone" defaultValue={client.phone || ""} />
            </div>
            <div className="ui-field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={client.status}>
                <option value="active">Active</option>
                <option value="lead">Lead</option>
                <option value="vip">VIP</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </EqualGrid>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="pipelineStage">Pipeline</label>
              <select id="pipelineStage" name="pipelineStage" defaultValue={client.pipelineStage}>
                {Object.values(ClientPipelineStage).map((stage) =>
                <option key={stage} value={stage}>
                    {enumLabel(stage)}
                  </option>
                )}
              </select>
            </div>
            <div className="ui-field">
              <label htmlFor="tags">Tags</label>
              <input id="tags" name="tags" defaultValue={client.tags.map((tag) => tag.label).join(", ")} />
            </div>
          </EqualGrid>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="alternateEmails">Alternate emails</label>
              <input id="alternateEmails" name="alternateEmails" defaultValue={stringArrayCsv(client.alternateEmails)} />
            </div>
            <div className="ui-field">
              <label htmlFor="alternatePhones">Alternate phones</label>
              <input id="alternatePhones" name="alternatePhones" defaultValue={stringArrayCsv(client.alternatePhones)} />
            </div>
          </EqualGrid>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="addressLine1">Address</label>
              <input id="addressLine1" name="addressLine1" defaultValue={client.addressLine1} />
            </div>
            <div className="ui-field">
              <label htmlFor="addressLine2">Address 2</label>
              <input id="addressLine2" name="addressLine2" defaultValue={client.addressLine2} />
            </div>
          </EqualGrid>
          <EqualGrid min="220px">
            <div className="ui-field">
              <label htmlFor="city">City</label>
              <input id="city" name="city" defaultValue={client.city} />
            </div>
            <div className="ui-field">
              <label htmlFor="region">State/region</label>
              <input id="region" name="region" defaultValue={client.region} />
            </div>
            <div className="ui-field">
              <label htmlFor="postalCode">Postal code</label>
              <input id="postalCode" name="postalCode" defaultValue={client.postalCode} />
            </div>
          </EqualGrid>
          <EqualGrid min="220px">
            <div className="ui-field">
              <label htmlFor="country">Country</label>
              <input id="country" name="country" defaultValue={client.country} />
            </div>
            <div className="ui-field">
              <label htmlFor="timezone">Timezone</label>
              <input id="timezone" name="timezone" defaultValue={client.timezone} placeholder={settings.timezone} />
            </div>
            <div className="ui-field">
              <label htmlFor="pronouns">Pronouns</label>
              <input id="pronouns" name="pronouns" defaultValue={client.pronouns} />
            </div>
          </EqualGrid>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="birthday">Birthday</label>
              <input id="birthday" name="birthday" type="date" defaultValue={dateInputValue(client.birthday)} />
            </div>
            <div className="ui-field">
              <label htmlFor="anniversary">Anniversary</label>
              <input id="anniversary" name="anniversary" type="date" defaultValue={dateInputValue(client.anniversary)} />
            </div>
          </EqualGrid>
          <div className="ui-field">
            <label htmlFor="preferences">Preferences</label>
            <textarea id="preferences" name="preferences" defaultValue={preferencesNotes(client.preferences)} />
          </div>
          <EqualGrid min="220px">
            <label className="ui-zero">
              <input name="emailOptIn" type="checkbox" defaultChecked={client.emailOptIn} />
              Email opt-in
            </label>
            <label className="ui-zero">
              <input name="smsOptIn" type="checkbox" defaultChecked={client.smsOptIn} />
              SMS opt-in
            </label>
            <label className="ui-zero">
              <input name="photoUsageRelease" type="checkbox" defaultChecked={client.photoUsageRelease} />
              Photo release
            </label>
          </EqualGrid>
          <EqualGrid min="220px">
            <label className="ui-zero">
              <input name="policyAccepted" type="checkbox" />
              Record policy acceptance
            </label>
            <label className="ui-zero">
              <input name="dataExportRequested" type="checkbox" defaultChecked={Boolean(client.dataExportRequestedAt)} />
              Data export requested
            </label>
            <label className="ui-zero">
              <input name="dataDeletionRequested" type="checkbox" defaultChecked={Boolean(client.dataDeletionRequestedAt)} />
              Deletion requested
            </label>
          </EqualGrid>
          <div className="ui-field">
            <label htmlFor="privateNotes">Private summary</label>
            <textarea id="privateNotes" name="privateNotes" defaultValue={client.privateNotes || ""} />
          </div>
          <Button type="submit">
            <Save size={18} />
            Save profile
          </Button>
        </Card>

        <Card action={addClientNoteAction} as="form" minHeight="none" bodyClassName="form-grid">
          <input type="hidden" name="clientId" value={client.id} />
          <h2 className="section-title">Add note</h2>
          <div className="ui-field">
            <label htmlFor="content">Note</label>
            <textarea id="content" name="content" required />
          </div>
          <Button type="submit">
            <Save size={18} />
            Save note
          </Button>
        </Card>
      </EqualGrid>

      <EqualGrid as="section">
        <Card action={addClientFileAction} as="form" minHeight="none" bodyClassName="form-grid">
          <input type="hidden" name="clientId" value={client.id} />
          <h2 className="section-title">Attach file</h2>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="file-title">Title</label>
              <input id="file-title" name="title" required />
            </div>
            <div className="ui-field">
              <label htmlFor="file-category">Category</label>
              <input id="file-category" name="category" placeholder="contract, gallery, upload" />
            </div>
          </EqualGrid>
          <div className="ui-field">
            <label htmlFor="file-url">URL or site path</label>
            <input id="file-url" name="url" placeholder="/uploads/file.pdf" required />
          </div>
          <div className="ui-field">
            <label htmlFor="file-notes">Notes</label>
            <textarea id="file-notes" name="notes" />
          </div>
          <Button type="submit" variant="secondary">
            <Save size={18} />
            Attach file
          </Button>
        </Card>

        <Card bodyClassName="ui-stack">
          <h2 className="section-title">CRM snapshot</h2>
          <div className="ui-zero">
            <span className="ui-badge">{client.status}</span>
            <span className="ui-badge">{enumLabel(client.pipelineStage)}</span>
            {client.emailOptIn ? <span className="ui-badge ui-badge-success">email opt-in</span> : null}
            {client.smsOptIn ? <span className="ui-badge ui-badge-success">sms opt-in</span> : null}
            {client.photoUsageRelease ? <span className="ui-badge ui-badge-success">photo release</span> : null}
            {client.dataExportRequestedAt ? <span className="ui-badge ui-badge-danger">export requested</span> : null}
            {client.dataDeletionRequestedAt ? <span className="ui-badge ui-badge-danger">deletion requested</span> : null}
          </div>
          <div>
            <h3>Tags</h3>
            {client.tags.map((tag) =>
            <span className="ui-badge ui-zero" key={tag.id}>
                {tag.label}
              </span>
            )}
            {!client.tags.length ? <p className="empty-state">No tags yet.</p> : null}
          </div>
          <div>
            <h3>Files</h3>
            {client.files.slice(0, 5).map((file) =>
            <div className="subpanel" key={file.id}>
                <p className="ui-zero">
                  <a href={file.url}>{file.title}</a>
                  <br />
                  <span className="muted-text">
                    {file.category || "file"} - {formatDateTime(file.uploadedAt, settings.timezone)}
                  </span>
                </p>
                <form action={deleteClientFileAction} className="form-grid">
                  <input type="hidden" name="id" value={file.id} />
                  <input type="hidden" name="clientId" value={client.id} />
                  <label className="ui-zero">
                    <input name="confirmDelete" type="checkbox" />
                    Confirm file delete
                  </label>
                  <Button type="submit" variant="secondary">
                    Delete file
                  </Button>
                </form>
              </div>
            )}
            {!client.files.length ? <p className="empty-state">No files attached.</p> : null}
          </div>
        </Card>
      </EqualGrid>

      <Card as="section">
        <div className="page-header compact-header">
          <div>
            <h2 className="section-title">Unified timeline</h2>
            <p className="ui-zero">
              Appointments, forms, testimonials, billing, orders, messages, and notes for this client.
            </p>
          </div>
        </div>
        <div className="stack">
          {timelineItems.map((item) =>
          <div className="subpanel" key={item.id}>
              <div className="ui-zero">
                <div>
                  <span className="ui-badge">{item.badge}</span>
                  <h3 className="ui-zero">
                    {item.href ? <Link href={item.href}>{item.title}</Link> : item.title}
                  </h3>
                  <p className="ui-zero">{item.detail}</p>
                </div>
                <span className="ui-badge">{formatDateTime(item.at, settings.timezone)}</span>
              </div>
            </div>
          )}
          {!timelineItems.length ? <p>No timeline activity yet.</p> : null}
        </div>
      </Card>

      <Card as="section" bodyClassName="ui-stack">
        <div className="page-header compact-header">
          <div>
            <h2 className="section-title">Email delivery history</h2>
            <p className="ui-zero">
              Outbox and manual message records matched by client email, appointments, orders, billing documents, and form submissions.
            </p>
          </div>
        </div>
        <Table>
          <thead>
            <tr>
              <th>Recipient</th>
              <th>Template</th>
              <th>Status</th>
              <th>Related</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {emailOutboxRows.map((row) => {
              const relatedHref = relatedRecordHref(row.relatedType, row.relatedId);
              const relatedLabel = relatedRecordLabel(row.relatedType, row.relatedId);

              return (
                <tr key={row.id}>
                  <td>
                    <strong>{row.recipientEmail}</strong>
                    <br />
                    <span className="muted-text">{row.subject || row.purpose}</span>
                  </td>
                  <td>{row.template?.name || row.templateKey || "Template removed"}</td>
                  <td>
                    <span className={emailOutboxStatusClass(row.status)}>{enumLabel(row.status)}</span>
                  </td>
                  <td>{relatedHref ? <Link href={relatedHref}>{relatedLabel}</Link> : relatedLabel}</td>
                  <td>{formatDateTime(row.sentAt || row.updatedAt, settings.timezone)}</td>
                </tr>);

            })}
            {!emailOutboxRows.length ?
            <tr>
                <td colSpan={5}>No outbox delivery records for this client yet.</td>
              </tr> :
            null}
          </tbody>
        </Table>
        <div className="subpanel">
          <h3 className="subsection-title">Manual message notes</h3>
          <Table>
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Template</th>
                <th>Status</th>
                <th>Related</th>
                <th>Logged</th>
              </tr>
            </thead>
            <tbody>
              {client.messageLogs.map((log) => {
                const relatedHref = relatedRecordHref(log.relatedType, log.relatedId);
                const relatedLabel = relatedRecordLabel(log.relatedType, log.relatedId);

                return (
                  <tr key={log.id}>
                    <td>
                      <strong>{log.recipientEmail || log.recipientPhone || client.email}</strong>
                      <br />
                      <span className="muted-text">{log.subject || log.purpose}</span>
                    </td>
                    <td>{log.template?.name || log.purpose}</td>
                    <td>
                      <span className={messageLogStatusClass(log.status)}>{enumLabel(log.status)}</span>
                    </td>
                    <td>{relatedHref ? <Link href={relatedHref}>{relatedLabel}</Link> : relatedLabel}</td>
                    <td>{formatDateTime(log.sentAt || log.createdAt, settings.timezone)}</td>
                  </tr>);

              })}
              {!client.messageLogs.length ?
              <tr>
                  <td colSpan={5}>No manual message notes for this client yet.</td>
                </tr> :
              null}
            </tbody>
          </Table>
        </div>
      </Card>

      <EqualGrid as="section">
        <Card>
          <h2 className="section-title">Appointment history</h2>
          <Table>
            <tbody>
              {client.bookings.map((booking) =>
              <tr key={booking.id}>
                  <td>
                    <Link href={`/admin/appointments/${booking.id}`}>
                      <strong>{booking.service.name}</strong>
                    </Link>
                    <br />
                    <span className="muted-text">{formatDateTime(booking.startsAt, settings.timezone)}</span>
                  </td>
                  <td>
                    <span className="ui-badge">{booking.status.toLowerCase()}</span>
                  </td>
                </tr>
              )}
              {!client.bookings.length ?
              <tr>
                  <td>No appointment history yet.</td>
                </tr> :
              null}
            </tbody>
          </Table>
        </Card>

        <Card>
          <h2 className="section-title">Notes</h2>
          <div className="stack">
            {client.notes.map((note) =>
            <div className="subpanel" key={note.id}>
                <p>{note.content}</p>
                <span className="ui-badge">{formatDateTime(note.createdAt, settings.timezone)}</span>
                <form action={deleteClientNoteAction} className="form-grid ui-zero">
                  <input type="hidden" name="id" value={note.id} />
                  <input type="hidden" name="clientId" value={client.id} />
                  <label className="ui-zero">
                    <input name="confirmDelete" type="checkbox" />
                    Confirm note delete
                  </label>
                  <Button type="submit" variant="secondary">
                    Delete note
                  </Button>
                </form>
              </div>
            )}
            {!client.notes.length ? <p>No client notes yet.</p> : null}
          </div>
        </Card>
      </EqualGrid>

      <Card as="section">
        <CalendarCheck size={22} />
        <h2 className="section-title">Service history</h2>
        <p className="lead lead-compact">
          This history is generated from appointments. Future product modules can attach purchases and packages here too.
        </p>
      </Card>
    </div>);

}
