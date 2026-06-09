import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, Save } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { enumLabel, formatDateTime, formatMoney } from "@/lib/format";
import { isRecord } from "@/lib/objects";
import { getSiteSettings } from "@/lib/site";
import { addClientNoteAction, updateClientAction } from "../actions";

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
  const [client, settings] = await Promise.all([
    prisma.client.findUnique({
      where: { id },
      include: {
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
          orderBy: { updatedAt: "desc" },
          take: 20
        },
        messageLogs: {
          include: { template: { select: { name: true, purpose: true } } },
          orderBy: { createdAt: "desc" },
          take: 40
        }
      }
    }),
    getSiteSettings()
  ]);

  if (!client) notFound();

  const timelineItems: TimelineItem[] = [
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
      detail: `${enumLabel(order.status)} | ${formatMoney(order.totalCents, order.currency)}`
    })),
    ...client.messageLogs.map((message) => ({
      id: `message-${message.id}`,
      at: message.sentAt || message.createdAt,
      badge: message.channel.toLowerCase(),
      title: message.subject || message.template?.name || message.purpose,
      detail: `${enumLabel(message.status)} | ${truncate(message.bodyPreview || message.recipientEmail || "No preview")}`
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
