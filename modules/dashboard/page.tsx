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
import { Badge, ButtonLink, Card, EmptyState, EqualGrid, StatTile, Table } from "@/components/ui";

export const dynamic = "force-dynamic";

function warningBadgeTone(severity: PlatformWarningSeverity) {
  if (severity === "critical") return "danger";
  if (severity === "warning") return "warning";
  return "neutral";
}

function readinessBadgeTone(className: string) {
  if (className.includes("danger")) return "danger";
  if (className.includes("warning")) return "warning";
  if (className.includes("success")) return "success";
  return "neutral";
}

export default async function AdminDashboardPage() {
  const settings = await getSiteSettings();
  const [bookings, upcomingCount, pendingCount, activeServiceCount, mediaCount, clientCount] = await Promise.all([
    prisma.booking.findMany({
      include: { service: true },
      where: {
        siteId: settings.siteId,
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { gte: new Date() }
      },
      orderBy: { startsAt: "asc" },
      take: 6
    }),
    prisma.booking.count({
      where: {
        siteId: settings.siteId,
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { gte: new Date() }
      }
    }),
    prisma.booking.count({
      where: {
        siteId: settings.siteId,
        status: "PENDING"
      }
    }),
    prisma.service.count({
      where: {
        siteId: settings.siteId,
        isActive: true
      }
    }),
    prisma.mediaAsset.count({ where: { siteId: settings.siteId } }),
    prisma.client.count({ where: { siteId: settings.siteId } })
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
          <h1>Client control room</h1>
          <p>Update the parts clients should touch without exposing the design system underneath.</p>
        </div>
        <ButtonLink href="/book" variant="secondary">
          Public booking page
        </ButtonLink>
      </header>

      <EqualGrid className="dashboard-stat-grid" min="180px" aria-label="Business snapshot">
        <StatTile href="/admin/modules/appointments" label="Upcoming" value={upcomingCount} detail="appointments ahead" />
        <StatTile href="/admin/modules/appointments" label="Needs review" value={pendingCount} detail="pending requests" />
        <StatTile href="/admin/modules/clients" label="Clients" value={clientCount} detail="saved records" />
        <StatTile href="/admin/modules/scheduling" label="Services" value={activeServiceCount} detail="active offerings" />
      </EqualGrid>

      <EqualGrid className="dashboard-stat-grid" min="180px" aria-label="Platform readiness snapshot">
        <StatTile href="/admin/modules/settings" label="Modules" value={platformStatus.enabledCount} detail="enabled in the shell" />
        <StatTile href="/admin/modules/help" label="Live or mixed" value={platformStatus.liveCount} detail="modules with runtime behavior" />
        <StatTile
          href="/admin/modules/help"
          label="Manual/foundation"
          value={platformStatus.manualCount + platformStatus.adminFoundationCount}
          detail="modules not fully live"
        />
        <StatTile href="/admin/modules/help" label="Warnings" value={platformStatus.warnings.length} detail="setup or operations notes" />
      </EqualGrid>

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
            <h2>Module readiness</h2>
            <p>Enabled modules with their current operating mode and public-route status.</p>
          </div>
          <ButtonLink variant="secondary" href="/admin/modules/settings">
            Manage modules
          </ButtonLink>
        </div>

        <EqualGrid className="module-readiness-grid" min="240px">
          {enabledModuleStatus.map((item) => (
            <Link className="module-readiness-card" href={item.module.href} key={item.module.id}>
              <Badge tone={readinessBadgeTone(item.pillClassName)}>{item.readinessLabel}</Badge>
              <strong>{item.module.label}</strong>
              <small>{item.modeLabel}</small>
              <p>{item.module.readiness.summary}</p>
              <span className="module-readiness-meta">
                {item.hasPublicRoute ? "Public route declared" : "Admin only"} - {item.warnings.length} warning
                {item.warnings.length === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
        </EqualGrid>
      </section>

      <Card
        as="section"
        className="dashboard-panel"
        minHeight="lg"
        reservedHeader={
          <div className="page-header">
            <div>
              <h2>Operational warnings</h2>
              <p>Setup gaps, manual-mode modules, and live checks that need attention.</p>
            </div>
            <AlertTriangle size={22} aria-hidden="true" />
          </div>
        }
      >
        {topWarnings.length ? (
          <Table className="dashboard-table">
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
                    <Badge tone={warningBadgeTone(item.severity)}>{item.severity}</Badge>
                  </td>
                  <td>{item.title}</td>
                  <td>{item.href ? <Link href={item.href}>{item.detail}</Link> : item.detail}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No platform warnings" description="All enabled modules are clear right now." />
        )}
      </Card>

      <Card
        as="section"
        className="dashboard-panel"
        minHeight="lg"
        reservedHeader={
          <div className="page-header">
            <div>
              <h2>Upcoming bookings</h2>
              <p>Newest appointments that still need attention.</p>
            </div>
            <ButtonLink variant="secondary" href="/admin/modules/appointments">
              <CalendarCheck size={18} />
              Manage appointments
            </ButtonLink>
          </div>
        }
      >
        <Table className="dashboard-table">
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
                  <Badge>{booking.status.toLowerCase()}</Badge>
                </td>
              </tr>
            ))}
            {!bookings.length ? (
              <tr>
                <td colSpan={4}>No upcoming bookings yet.</td>
              </tr>
            ) : null}
          </tbody>
        </Table>

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
                  <Badge>{booking.status.toLowerCase()}</Badge>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="dashboard-appointment-list">
            <EmptyState title="No upcoming bookings" description="New bookings will appear here with the same reserved row height." />
          </div>
        )}
      </Card>
    </div>
  );
}
