import Link from "next/link";
import { BookingStatus, Prisma } from "@prisma/client";
import { CalendarDays, Clock, ListChecks } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { AppointmentsTable } from "./components/appointments-table";

export const dynamic = "force-dynamic";

const pageSize = 25;
const statusFilters = ["upcoming", "all", ...Object.values(BookingStatus).map((status) => status.toLowerCase())] as const;

type AppointmentsPageProps = {
  searchParams?: Promise<{ page?: string; status?: string; error?: string }>;
};

function normalizeStatusFilter(value?: string) {
  return statusFilters.includes(value as (typeof statusFilters)[number]) ? value || "upcoming" : "upcoming";
}

export default async function AppointmentsPage({ searchParams }: AppointmentsPageProps = {}) {
  const now = new Date();
  const params = searchParams ? await searchParams : {};
  const page = Math.max(1, Number(params.page || 1) || 1);
  const statusFilter = normalizeStatusFilter(params.status);
  const bookingWhere: Prisma.BookingWhereInput =
    statusFilter === "upcoming"
      ? { status: { not: BookingStatus.CANCELED }, startsAt: { gte: now } }
      : statusFilter === "all"
        ? {}
        : { status: statusFilter.toUpperCase() as BookingStatus };

  const [bookings, bookingCount, pendingCount, upcomingCount, settings] = await Promise.all([
    prisma.booking.findMany({
      where: bookingWhere,
      include: { service: true },
      orderBy: { startsAt: statusFilter === "upcoming" ? "asc" : "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.booking.count({ where: bookingWhere }),
    prisma.booking.count({ where: { status: "PENDING" } }),
    prisma.booking.count({
      where: {
        status: { not: "CANCELED" },
        startsAt: { gte: now }
      }
    }),
    getSiteSettings()
  ]);
  const pageCount = Math.max(1, Math.ceil(bookingCount / pageSize));

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Appointments</p>
          <h1 style={{ fontSize: "2.4rem" }}>Active appointment desk</h1>
          <p>Review upcoming bookings, confirm requests, cancel conflicts, and mark completed work.</p>
        </div>
        <Link className="button secondary" href="/admin/modules/scheduling">
          <CalendarDays size={18} />
          Scheduling setup
        </Link>
      </header>

      {params.error ? <div className="error">{params.error}</div> : null}

      <section className="grid-3">
        <div className="card">
          <Clock size={22} />
          <h3>{upcomingCount} upcoming</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Non-canceled appointments from today forward.
          </p>
        </div>
        <div className="card">
          <ListChecks size={22} />
          <h3>{pendingCount} pending</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Requests that may need confirmation.
          </p>
        </div>
        <div className="card">
          <CalendarDays size={22} />
          <h3>Operations</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            This is the everyday appointment workspace.
          </p>
        </div>
      </section>

      <section className="card">
        <div className="page-header" style={{ marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: "1.35rem" }}>Appointment list</h2>
            <p style={{ color: "var(--muted)", margin: 0 }}>{bookingCount} matching appointments</p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {statusFilters.map((filter) => (
              <Link
                className={filter === statusFilter ? "button" : "button secondary"}
                href={`/admin/modules/appointments?status=${filter}`}
                key={filter}
              >
                {filter}
              </Link>
            ))}
          </div>
        </div>
        <AppointmentsTable bookings={bookings} timezone={settings.timezone} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <Link
            aria-disabled={page <= 1}
            className="button secondary"
            href={`/admin/modules/appointments?status=${statusFilter}&page=${Math.max(1, page - 1)}`}
          >
            Previous
          </Link>
          <span className="pill">
            Page {Math.min(page, pageCount)} of {pageCount}
          </span>
          <Link
            aria-disabled={page >= pageCount}
            className="button secondary"
            href={`/admin/modules/appointments?status=${statusFilter}&page=${Math.min(pageCount, page + 1)}`}
          >
            Next
          </Link>
        </div>
      </section>
    </div>
  );
}
