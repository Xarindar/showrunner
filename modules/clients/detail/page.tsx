import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientPipelineStage, EmailOutboxStatus, MessageLogStatus } from "@prisma/client";
import { CalendarCheck, Save } from "lucide-react";
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
  updateClientAction
} from "../actions";

export const dynamic = "force-dynamic";

type ClientDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
};

type TimelineItem = {
  id: string;
  at: Date;
  badge: string;
  title: string;
  detail: string;
  href?: string;
};

function truncate(value: string, length = 140) {
  return value.length > length ? `${value.slice(0, length - 1)}...` : value;
}

function dateInputValue(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function preferencesNotes(value: unknown) {
  return isRecord(value) && typeof value.notes === "string" ? value.notes : "";
}

function clientEmailSet(client: { alternateEmails: unknown; email: string }) {
  return [...new Set([client.email, ...stringArrayFromUnknown(client.alternateEmails)].map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

function emailOutboxStatusClass(status: EmailOutboxStatus) {
  if (status === EmailOutboxStatus.SENT) return "pill success";
  if (status === EmailOutboxStatus.FAILED || status === EmailOutboxStatus.SUPPRESSED || status === EmailOutboxStatus.CANCELED) {
    return "pill danger";
  }
  return "pill";
}

function messageLogStatusClass(status: MessageLogStatus) {
  if (status === MessageLogStatus.SENT) return "pill success";
  if (status === MessageLogStatus.FAILED || status === MessageLogStatus.SUPPRESSED) return "pill danger";
  return "pill";
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

  const entries = Object.entries(value)
    .map(([key, item]) => {
      if (isRecord(item) && "value" in item) {
        return [String(item.label || key), item.value] as const;
      }

      return [key, item] as const;
    })
    .filter(([, item]) => String(item || "").trim())
    .slice(0, 3);

  return entries.length ? truncate(entries.map(([key, item]) => `${key}: ${String(item)}`).join(" | ")) : "No response data";
}

export default async function ClientDetailPage({ params, searchParams }: ClientDetailPageProps) {
  const [{ id }, { saved, error }] = await Promise.all([params, searchParams]);
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
  const relatedOutboxFilters: Array<{ relatedType: string; relatedId: { in: string[] } }> = [];
  if (bookingIds.length) relatedOutboxFilters.push({ relatedType: "booking", relatedId: { in: bookingIds } });
  if (orderIds.length) relatedOutboxFilters.push({ relatedType: "order", relatedId: { in: orderIds } });
  if (billingDocumentIds.length) relatedOutboxFilters.push({ relatedType: "billingDocument", relatedId: { in: billingDocumentIds } });
  if (formSubmissionIds.length) {
    relatedOutboxFilters.push({ relatedType: "formSubmission", relatedId: { in: formSubmissionIds } });
    relatedOutboxFilters.push({ relatedType: "form_submission", relatedId: { in: formSubmissionIds } });
  }

  const [galleryAccesses, galleryFavorites, proofApprovals, proofDecisions, emailOutboxRows] = await Promise.all([
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
    })
  ]);

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
    }))
  ]
    .sort((first, second) => second.at.getTime() - first.at.getTime())
    .slice(0, 80);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Client</p>
          <h1 style={{ fontSize: "2.4rem" }}>{client.name}</h1>
          <p>{client.email}</p>
        </div>
        <Link className="button secondary" href="/admin/modules/clients">
          Back to clients
        </Link>
      </header>

      {saved ? <div className="success-message">Client record updated.</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <section className="grid-2">
        <form action={updateClientAction} className="card form-grid">
          <input type="hidden" name="id" value={client.id} />
          <h2 style={{ fontSize: "1.35rem" }}>Profile</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" defaultValue={client.name} required />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" defaultValue={client.email} required />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="companyName">Company</label>
              <input id="companyName" name="companyName" defaultValue={client.companyName} />
            </div>
            <div className="field">
              <label htmlFor="familyName">Family or household</label>
              <input id="familyName" name="familyName" defaultValue={client.familyName} />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input id="phone" name="phone" defaultValue={client.phone || ""} />
            </div>
            <div className="field">
              <label htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={client.status}>
                <option value="active">Active</option>
                <option value="lead">Lead</option>
                <option value="vip">VIP</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="pipelineStage">Pipeline</label>
              <select id="pipelineStage" name="pipelineStage" defaultValue={client.pipelineStage}>
                {Object.values(ClientPipelineStage).map((stage) => (
                  <option key={stage} value={stage}>
                    {enumLabel(stage)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="tags">Tags</label>
              <input id="tags" name="tags" defaultValue={client.tags.map((tag) => tag.label).join(", ")} />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="alternateEmails">Alternate emails</label>
              <input id="alternateEmails" name="alternateEmails" defaultValue={stringArrayCsv(client.alternateEmails)} />
            </div>
            <div className="field">
              <label htmlFor="alternatePhones">Alternate phones</label>
              <input id="alternatePhones" name="alternatePhones" defaultValue={stringArrayCsv(client.alternatePhones)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="addressLine1">Address</label>
              <input id="addressLine1" name="addressLine1" defaultValue={client.addressLine1} />
            </div>
            <div className="field">
              <label htmlFor="addressLine2">Address 2</label>
              <input id="addressLine2" name="addressLine2" defaultValue={client.addressLine2} />
            </div>
          </div>
          <div className="grid-3">
            <div className="field">
              <label htmlFor="city">City</label>
              <input id="city" name="city" defaultValue={client.city} />
            </div>
            <div className="field">
              <label htmlFor="region">State/region</label>
              <input id="region" name="region" defaultValue={client.region} />
            </div>
            <div className="field">
              <label htmlFor="postalCode">Postal code</label>
              <input id="postalCode" name="postalCode" defaultValue={client.postalCode} />
            </div>
          </div>
          <div className="grid-3">
            <div className="field">
              <label htmlFor="country">Country</label>
              <input id="country" name="country" defaultValue={client.country} />
            </div>
            <div className="field">
              <label htmlFor="timezone">Timezone</label>
              <input id="timezone" name="timezone" defaultValue={client.timezone} placeholder={settings.timezone} />
            </div>
            <div className="field">
              <label htmlFor="pronouns">Pronouns</label>
              <input id="pronouns" name="pronouns" defaultValue={client.pronouns} />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="birthday">Birthday</label>
              <input id="birthday" name="birthday" type="date" defaultValue={dateInputValue(client.birthday)} />
            </div>
            <div className="field">
              <label htmlFor="anniversary">Anniversary</label>
              <input id="anniversary" name="anniversary" type="date" defaultValue={dateInputValue(client.anniversary)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="preferences">Preferences</label>
            <textarea id="preferences" name="preferences" defaultValue={preferencesNotes(client.preferences)} />
          </div>
          <div className="grid-3">
            <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
              <input name="emailOptIn" type="checkbox" defaultChecked={client.emailOptIn} />
              Email opt-in
            </label>
            <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
              <input name="smsOptIn" type="checkbox" defaultChecked={client.smsOptIn} />
              SMS opt-in
            </label>
            <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
              <input name="photoUsageRelease" type="checkbox" defaultChecked={client.photoUsageRelease} />
              Photo release
            </label>
          </div>
          <div className="grid-3">
            <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
              <input name="policyAccepted" type="checkbox" />
              Record policy acceptance
            </label>
            <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
              <input name="dataExportRequested" type="checkbox" defaultChecked={Boolean(client.dataExportRequestedAt)} />
              Data export requested
            </label>
            <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
              <input name="dataDeletionRequested" type="checkbox" defaultChecked={Boolean(client.dataDeletionRequestedAt)} />
              Deletion requested
            </label>
          </div>
          <div className="field">
            <label htmlFor="privateNotes">Private summary</label>
            <textarea id="privateNotes" name="privateNotes" defaultValue={client.privateNotes || ""} />
          </div>
          <button className="button" type="submit">
            <Save size={18} />
            Save profile
          </button>
        </form>

        <form action={addClientNoteAction} className="card form-grid">
          <input type="hidden" name="clientId" value={client.id} />
          <h2 style={{ fontSize: "1.35rem" }}>Add note</h2>
          <div className="field">
            <label htmlFor="content">Note</label>
            <textarea id="content" name="content" required />
          </div>
          <button className="button" type="submit">
            <Save size={18} />
            Save note
          </button>
        </form>
      </section>

      <section className="grid-2">
        <form action={addClientFileAction} className="card form-grid">
          <input type="hidden" name="clientId" value={client.id} />
          <h2 style={{ fontSize: "1.35rem" }}>Attach file</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="file-title">Title</label>
              <input id="file-title" name="title" required />
            </div>
            <div className="field">
              <label htmlFor="file-category">Category</label>
              <input id="file-category" name="category" placeholder="contract, gallery, upload" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="file-url">URL or site path</label>
            <input id="file-url" name="url" placeholder="/uploads/file.pdf" required />
          </div>
          <div className="field">
            <label htmlFor="file-notes">Notes</label>
            <textarea id="file-notes" name="notes" />
          </div>
          <button className="button secondary" type="submit">
            <Save size={18} />
            Attach file
          </button>
        </form>

        <div className="card stack">
          <h2 style={{ fontSize: "1.35rem" }}>CRM snapshot</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span className="pill">{client.status}</span>
            <span className="pill">{enumLabel(client.pipelineStage)}</span>
            {client.emailOptIn ? <span className="pill success">email opt-in</span> : null}
            {client.smsOptIn ? <span className="pill success">sms opt-in</span> : null}
            {client.photoUsageRelease ? <span className="pill success">photo release</span> : null}
            {client.dataExportRequestedAt ? <span className="pill danger">export requested</span> : null}
            {client.dataDeletionRequestedAt ? <span className="pill danger">deletion requested</span> : null}
          </div>
          <div>
            <h3 style={{ fontSize: "1rem" }}>Tags</h3>
            {client.tags.map((tag) => (
              <span className="pill" key={tag.id} style={{ marginRight: 4 }}>
                {tag.label}
              </span>
            ))}
            {!client.tags.length ? <p className="empty-state">No tags yet.</p> : null}
          </div>
          <div>
            <h3 style={{ fontSize: "1rem" }}>Files</h3>
            {client.files.slice(0, 5).map((file) => (
              <div className="subpanel" key={file.id}>
                <p style={{ margin: "0 0 8px" }}>
                  <a href={file.url}>{file.title}</a>
                  <br />
                  <span style={{ color: "var(--muted)" }}>
                    {file.category || "file"} - {formatDateTime(file.uploadedAt, settings.timezone)}
                  </span>
                </p>
                <form action={deleteClientFileAction} className="form-grid">
                  <input type="hidden" name="id" value={file.id} />
                  <input type="hidden" name="clientId" value={client.id} />
                  <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                    <input name="confirmDelete" type="checkbox" />
                    Confirm file delete
                  </label>
                  <button className="button secondary" type="submit">
                    Delete file
                  </button>
                </form>
              </div>
            ))}
            {!client.files.length ? <p className="empty-state">No files attached.</p> : null}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="page-header" style={{ marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: "1.35rem" }}>Unified timeline</h2>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              Appointments, forms, testimonials, billing, orders, messages, and notes for this client.
            </p>
          </div>
        </div>
        <div className="stack">
          {timelineItems.map((item) => (
            <div className="subpanel" key={item.id}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
                <div>
                  <span className="pill">{item.badge}</span>
                  <h3 style={{ fontSize: "1rem", margin: "8px 0 4px" }}>
                    {item.href ? <Link href={item.href}>{item.title}</Link> : item.title}
                  </h3>
                  <p style={{ color: "var(--muted)", margin: 0 }}>{item.detail}</p>
                </div>
                <span className="pill">{formatDateTime(item.at, settings.timezone)}</span>
              </div>
            </div>
          ))}
          {!timelineItems.length ? <p>No timeline activity yet.</p> : null}
        </div>
      </section>

      <section className="card stack">
        <div className="page-header" style={{ marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: "1.35rem" }}>Email delivery history</h2>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              Outbox and manual message records matched by client email, appointments, orders, billing documents, and form submissions.
            </p>
          </div>
        </div>
        <table className="table">
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
                    <span style={{ color: "var(--muted)" }}>{row.subject || row.purpose}</span>
                  </td>
                  <td>{row.template?.name || row.templateKey || "Template removed"}</td>
                  <td>
                    <span className={emailOutboxStatusClass(row.status)}>{enumLabel(row.status)}</span>
                  </td>
                  <td>{relatedHref ? <Link href={relatedHref}>{relatedLabel}</Link> : relatedLabel}</td>
                  <td>{formatDateTime(row.sentAt || row.updatedAt, settings.timezone)}</td>
                </tr>
              );
            })}
            {!emailOutboxRows.length ? (
              <tr>
                <td colSpan={5}>No outbox delivery records for this client yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="subpanel">
          <h3 style={{ fontSize: "1.05rem" }}>Manual message notes</h3>
          <table className="table">
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
                      <span style={{ color: "var(--muted)" }}>{log.subject || log.purpose}</span>
                    </td>
                    <td>{log.template?.name || log.purpose}</td>
                    <td>
                      <span className={messageLogStatusClass(log.status)}>{enumLabel(log.status)}</span>
                    </td>
                    <td>{relatedHref ? <Link href={relatedHref}>{relatedLabel}</Link> : relatedLabel}</td>
                    <td>{formatDateTime(log.sentAt || log.createdAt, settings.timezone)}</td>
                  </tr>
                );
              })}
              {!client.messageLogs.length ? (
                <tr>
                  <td colSpan={5}>No manual message notes for this client yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <h2 style={{ fontSize: "1.35rem" }}>Appointment history</h2>
          <table className="table">
            <tbody>
              {client.bookings.map((booking) => (
                <tr key={booking.id}>
                  <td>
                    <Link href={`/admin/appointments/${booking.id}`}>
                      <strong>{booking.service.name}</strong>
                    </Link>
                    <br />
                    <span style={{ color: "var(--muted)" }}>{formatDateTime(booking.startsAt, settings.timezone)}</span>
                  </td>
                  <td>
                    <span className="pill">{booking.status.toLowerCase()}</span>
                  </td>
                </tr>
              ))}
              {!client.bookings.length ? (
                <tr>
                  <td>No appointment history yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2 style={{ fontSize: "1.35rem" }}>Notes</h2>
          <div className="stack">
            {client.notes.map((note) => (
              <div className="subpanel" key={note.id}>
                <p>{note.content}</p>
                <span className="pill">{formatDateTime(note.createdAt, settings.timezone)}</span>
                <form action={deleteClientNoteAction} className="form-grid" style={{ marginTop: 12 }}>
                  <input type="hidden" name="id" value={note.id} />
                  <input type="hidden" name="clientId" value={client.id} />
                  <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                    <input name="confirmDelete" type="checkbox" />
                    Confirm note delete
                  </label>
                  <button className="button secondary" type="submit">
                    Delete note
                  </button>
                </form>
              </div>
            ))}
            {!client.notes.length ? <p>No client notes yet.</p> : null}
          </div>
        </div>
      </section>

      <section className="card">
        <CalendarCheck size={22} />
        <h2 style={{ fontSize: "1.35rem" }}>Service history</h2>
        <p className="lead" style={{ fontSize: "0.95rem" }}>
          This history is generated from appointments. Future product modules can attach purchases and packages here too.
        </p>
      </section>
    </div>
  );
}
