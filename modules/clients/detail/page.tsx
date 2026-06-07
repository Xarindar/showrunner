import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, Save } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { getSiteSettings } from "@/lib/site";
import { addClientNoteAction, updateClientAction } from "../actions";

export const dynamic = "force-dynamic";

type ClientDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
};

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
        }
      }
    }),
    getSiteSettings()
  ]);

  if (!client) notFound();

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
