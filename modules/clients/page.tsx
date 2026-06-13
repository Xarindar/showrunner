import Link from "next/link";
import { Prisma } from "@prisma/client";
import { Plus, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { getSiteSettings } from "@/lib/site";
import { createClientAction } from "./actions";

export const dynamic = "force-dynamic";

const pageSize = 25;

type ClientsPageProps = {
  searchParams?: Promise<{ page?: string; q?: string; error?: string }>;
};

export default async function ClientsPage({ searchParams }: ClientsPageProps = {}) {
  const params = searchParams ? await searchParams : {};
  const settings = await getSiteSettings();
  const page = Math.max(1, Number(params.page || 1) || 1);
  const query = String(params.q || "").trim();
  const where: Prisma.ClientWhereInput = query
    ? {
        siteId: settings.siteId,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } }
        ]
      }
    : { siteId: settings.siteId };
  const [clients, clientCount] = await Promise.all([
    prisma.client.findMany({
      where,
      include: {
        _count: { select: { bookings: true, notes: true } },
        bookings: { orderBy: { startsAt: "desc" }, take: 1 }
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.client.count({ where })
  ]);
  const pageCount = Math.max(1, Math.ceil(clientCount / pageSize));

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Clients</p>
          <h1 style={{ fontSize: "2.4rem" }}>Client book</h1>
          <p>Track long-term client relationships, appointment history, and private notes.</p>
        </div>
      </header>

      {params.error ? <div className="error">{params.error}</div> : null}

      <section className="grid-2">
        <form action={createClientAction} className="card form-grid">
          <h2 style={{ fontSize: "1.35rem" }}>Add client</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" required />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" />
          </div>
          <div className="field">
            <label htmlFor="privateNotes">Private notes</label>
            <textarea id="privateNotes" name="privateNotes" />
          </div>
          <button className="button" type="submit">
            <Plus size={18} />
            Add client
          </button>
        </form>

        <div className="card">
          <Users size={22} />
          <h2 style={{ fontSize: "1.35rem" }}>{clientCount} clients</h2>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Public bookings automatically create or update client records by email address.
          </p>
        </div>
      </section>

      <section className="card">
        <div className="page-header" style={{ marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: "1.35rem" }}>Client list</h2>
            <p style={{ color: "var(--muted)", margin: 0 }}>{clientCount} matching clients</p>
          </div>
          <form action="/admin/modules/clients" style={{ display: "flex", gap: 8 }}>
            <input aria-label="Search clients" name="q" placeholder="Search clients" defaultValue={query} />
            <button className="button secondary" type="submit">
              Search
            </button>
          </form>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Client</th>
              <th>History</th>
              <th>Last appointment</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id}>
                <td>
                  <Link href={`/admin/clients/${client.id}`}>
                    <strong>{client.name}</strong>
                  </Link>
                  <br />
                  <span style={{ color: "var(--muted)" }}>{client.email}</span>
                </td>
                <td>
                  {client._count.bookings} appointments, {client._count.notes} notes
                </td>
                <td>{client.bookings[0] ? formatDateTime(client.bookings[0].startsAt, settings.timezone) : "None yet"}</td>
                <td>
                  <span className="pill">{client.status}</span>
                </td>
              </tr>
            ))}
            {!clients.length ? (
              <tr>
                <td colSpan={4}>No clients yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <Link
            aria-disabled={page <= 1}
            className="button secondary"
            href={`/admin/modules/clients?q=${encodeURIComponent(query)}&page=${Math.max(1, page - 1)}`}
          >
            Previous
          </Link>
          <span className="pill">
            Page {Math.min(page, pageCount)} of {pageCount}
          </span>
          <Link
            aria-disabled={page >= pageCount}
            className="button secondary"
            href={`/admin/modules/clients?q=${encodeURIComponent(query)}&page=${Math.min(pageCount, page + 1)}`}
          >
            Next
          </Link>
        </div>
      </section>
    </div>
  );
}
