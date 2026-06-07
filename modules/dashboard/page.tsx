import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  Image as ImageIcon,
  LayoutTemplate,
  Users
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { getSiteSettings } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [bookings, upcomingCount, pendingCount, activeServiceCount, mediaCount, clientCount, settings] = await Promise.all([
    prisma.booking.findMany({
      include: { service: true },
      where: {
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { gte: new Date() }
      },
      orderBy: { startsAt: "asc" },
      take: 6
    }),
    prisma.booking.count({
      where: {
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { gte: new Date() }
      }
    }),
    prisma.booking.count({
      where: {
        status: "PENDING"
      }
    }),
    prisma.service.count({
      where: {
        isActive: true
      }
    }),
    prisma.mediaAsset.count(),
    prisma.client.count(),
    getSiteSettings()
  ]);

  const actionCards = [
    {
      href: "/admin/modules/content",
      icon: LayoutTemplate,
      label: "Content",
      value: "Site copy",
      description: "Hero image, headline, intro copy, and simple page text."
    },
    {
      href: "/admin/modules/appointments",
      icon: CalendarCheck,
      label: "Appointments",
      value: `${pendingCount} pending`,
      description: "Confirm, cancel, complete, and review customer bookings."
    },
    {
      href: "/admin/modules/scheduling",
      icon: CalendarDays,
      label: "Scheduling",
      value: `${activeServiceCount} active services`,
      description: "Services, hours, and blockouts that control availability."
    },
    {
      href: "/admin/modules/clients",
      icon: Users,
      label: "Clients",
      value: `${clientCount} records`,
      description: "Long-term records, notes, and appointment history."
    },
    {
      href: "/admin/modules/media",
      icon: ImageIcon,
      label: "Media",
      value: `${mediaCount} uploads`,
      description: "Repo assets by default, R2 uploads when configured."
    }
  ];

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 style={{ fontSize: "2.4rem" }}>Client control room</h1>
          <p>Update the parts clients should touch without exposing the design system underneath.</p>
        </div>
        <Link href="/book" className="button secondary">
          Public booking page
        </Link>
      </header>

      <section className="dashboard-stat-grid" aria-label="Business snapshot">
        <Link className="dashboard-stat" href="/admin/modules/appointments">
          <span>Upcoming</span>
          <strong>{upcomingCount}</strong>
          <small>appointments ahead</small>
        </Link>
        <Link className="dashboard-stat" href="/admin/modules/appointments">
          <span>Needs review</span>
          <strong>{pendingCount}</strong>
          <small>pending requests</small>
        </Link>
        <Link className="dashboard-stat" href="/admin/modules/clients">
          <span>Clients</span>
          <strong>{clientCount}</strong>
          <small>saved records</small>
        </Link>
        <Link className="dashboard-stat" href="/admin/modules/scheduling">
          <span>Services</span>
          <strong>{activeServiceCount}</strong>
          <small>active offerings</small>
        </Link>
      </section>

      <section className="dashboard-action-grid" aria-label="Admin shortcuts">
        {actionCards.map((card) => {
          const Icon = card.icon;

          return (
            <Link className="dashboard-action-card" href={card.href} key={card.href}>
              <span className="dashboard-card-icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <span>
                <span className="dashboard-card-label">{card.label}</span>
                <strong>{card.value}</strong>
                <small>{card.description}</small>
              </span>
              <ArrowRight className="dashboard-card-arrow" size={18} aria-hidden="true" />
            </Link>
          );
        })}
      </section>

      <section className="card dashboard-panel">
        <div className="page-header">
          <div>
            <h2 style={{ fontSize: "1.5rem" }}>Upcoming bookings</h2>
            <p>Newest appointments that still need attention.</p>
          </div>
          <Link className="button secondary" href="/admin/modules/appointments">
            <CalendarCheck size={18} />
            Manage appointments
          </Link>
        </div>

        <table className="table dashboard-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Service</th>
              <th>Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((booking) => (
              <tr key={booking.id}>
                <td>
                  <Link href={`/admin/appointments/${booking.id}`}>{booking.customerName}</Link>
                </td>
                <td>{booking.service.name}</td>
                <td>{formatDateTime(booking.startsAt, settings.timezone)}</td>
                <td>
                  <span className="pill">{booking.status.toLowerCase()}</span>
                </td>
              </tr>
            ))}
            {!bookings.length ? (
              <tr>
                <td colSpan={4}>No upcoming bookings yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {bookings.length ? (
          <div className="dashboard-appointment-list">
            {bookings.map((booking) => (
              <Link className="appointment-row-card" href={`/admin/appointments/${booking.id}`} key={booking.id}>
                <span>
                  <strong>{booking.customerName}</strong>
                  <small>{booking.service.name}</small>
                </span>
                <span>
                  <small>{formatDateTime(booking.startsAt, settings.timezone)}</small>
                  <span className="pill">{booking.status.toLowerCase()}</span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="dashboard-appointment-list">
            <p className="empty-state">No upcoming bookings yet.</p>
          </div>
        )}
      </section>
    </div>
  );
}
