import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  Image as ImageIcon,
  LayoutTemplate,
  Users
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { getPlatformStatus, type PlatformWarningSeverity } from "@/lib/platform-status";
import { getSiteSettings } from "@/lib/site";
import type { ModuleId } from "@/shell/modules";

export const dynamic = "force-dynamic";

function warningPillClassName(severity: PlatformWarningSeverity) {
  if (severity === "critical") return "pill danger";
  if (severity === "warning") return "pill warning";
  return "pill";
}

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
  const platformStatus = await getPlatformStatus(settings);
  const warningPriority = { critical: 0, warning: 1, info: 2 } satisfies Record<PlatformWarningSeverity, number>;
  const topWarnings = [...platformStatus.warnings]
    .sort((left, right) => warningPriority[left.severity] - warningPriority[right.severity])
    .slice(0, 6);
  const enabledModuleStatus = platformStatus.modules.filter((item) => item.enabled);

  const actionCards = [
    {
      moduleId: "content",
      href: "/admin/modules/content",
      icon: LayoutTemplate,
      label: "Content",
      value: "Site copy",
      description: "Hero image, headline, intro copy, and simple page text."
    },
    {
      moduleId: "appointments",
      href: "/admin/modules/appointments",
      icon: CalendarCheck,
      label: "Appointments",
      value: `${pendingCount} pending`,
      description: "Confirm, cancel, complete, and review customer bookings."
    },
    {
      moduleId: "scheduling",
      href: "/admin/modules/scheduling",
      icon: CalendarDays,
      label: "Scheduling",
      value: `${activeServiceCount} active services`,
      description: "Services, hours, and blockouts that control availability."
    },
    {
      moduleId: "clients",
      href: "/admin/modules/clients",
      icon: Users,
      label: "Clients",
      value: `${clientCount} records`,
      description: "Long-term records, notes, and appointment history."
    },
    {
      moduleId: "media",
      href: "/admin/modules/media",
      icon: ImageIcon,
      label: "Media",
      value: `${mediaCount} uploads`,
      description: "Repo assets by default, R2 uploads when configured."
    }
  ].filter((card) => settings.enabledModuleIds.includes(card.moduleId as ModuleId));

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

      <section className="dashboard-stat-grid" aria-label="Platform readiness snapshot">
        <Link className="dashboard-stat" href="/admin/modules/settings">
          <span>Modules</span>
          <strong>{platformStatus.enabledCount}</strong>
          <small>enabled in the shell</small>
        </Link>
        <Link className="dashboard-stat" href="/admin/modules/help">
          <span>Live or mixed</span>
          <strong>{platformStatus.liveCount}</strong>
          <small>modules with runtime behavior</small>
        </Link>
        <Link className="dashboard-stat" href="/admin/modules/help">
          <span>Manual/foundation</span>
          <strong>{platformStatus.manualCount + platformStatus.adminFoundationCount}</strong>
          <small>modules not fully live</small>
        </Link>
        <Link className="dashboard-stat" href="/admin/modules/help">
          <span>Warnings</span>
          <strong>{platformStatus.warnings.length}</strong>
          <small>setup or operations notes</small>
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

      <section className="stack" aria-label="Module readiness">
        <div className="page-header">
          <div>
            <h2 style={{ fontSize: "1.5rem" }}>Module readiness</h2>
            <p>Enabled modules with their current operating mode and public-route status.</p>
          </div>
          <Link className="button secondary" href="/admin/modules/settings">
            Manage modules
          </Link>
        </div>

        <div className="module-readiness-grid">
          {enabledModuleStatus.map((item) => (
            <Link className="module-readiness-card" href={item.module.href} key={item.module.id}>
              <span className={item.pillClassName}>{item.readinessLabel}</span>
              <strong>{item.module.label}</strong>
              <small>{item.modeLabel}</small>
              <p>{item.module.readiness.summary}</p>
              <span className="module-readiness-meta">
                {item.hasPublicRoute ? "Public route declared" : "Admin only"} - {item.warnings.length} warning
                {item.warnings.length === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="card dashboard-panel">
        <div className="page-header">
          <div>
            <h2 style={{ fontSize: "1.5rem" }}>Operational warnings</h2>
            <p>Setup gaps, manual-mode modules, and live checks that need attention.</p>
          </div>
          <AlertTriangle size={22} aria-hidden="true" />
        </div>

        {topWarnings.length ? (
          <table className="table dashboard-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Area</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {topWarnings.map((item) => (
                <tr key={`${item.moduleId || "platform"}-${item.title}`}>
                  <td>
                    <span className={warningPillClassName(item.severity)}>{item.severity}</span>
                  </td>
                  <td>{item.title}</td>
                  <td>{item.href ? <Link href={item.href}>{item.detail}</Link> : item.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty-state">No platform warnings are active.</p>
        )}
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
