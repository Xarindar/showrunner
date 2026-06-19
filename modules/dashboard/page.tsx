import Link from "next/link";
import { ArrowRight, CalendarCheck, CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { getSiteSettings } from "@/lib/site";
import { moduleIcons, moduleRegistry, type ModuleId } from "@/shell/modules";
import { Badge, ButtonLink, Card, EmptyState, EqualGrid, StatTile, Table } from "@/components/ui";
import { getOnboardingChecklist } from "./onboarding";

export const dynamic = "force-dynamic";

// Modules that earn a quick-access card on the dashboard, in registry order. This is the curated default
// set; the longer-term goal is to let each client pick which module cards live here, which is why every
// card is built generically from the registry (label/icon/href/description) plus an optional live metric.
const QUICK_ACCESS_MODULES: ModuleId[] = [
  "appointments",
  "scheduling",
  "clients",
  "content",
  "media",
  "communications",
  "payments",
  "products",
  "forms",
  "portfolio",
  "testimonials"
];

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export default async function AdminDashboardPage() {
  const settings = await getSiteSettings();
  const [bookings, upcomingCount, pendingCount, activeServiceCount, mediaCount, clientCount, onboarding] = await Promise.all([
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
      where: { siteId: settings.siteId, status: { in: ["PENDING", "CONFIRMED"] }, startsAt: { gte: new Date() } }
    }),
    prisma.booking.count({ where: { siteId: settings.siteId, status: "PENDING" } }),
    prisma.service.count({ where: { siteId: settings.siteId, isActive: true } }),
    prisma.mediaAsset.count({ where: { siteId: settings.siteId } }),
    prisma.client.count({ where: { siteId: settings.siteId } }),
    getOnboardingChecklist(settings)
  ]);

  const metricByModule: Partial<Record<ModuleId, string>> = {
    appointments: `${pendingCount} pending · ${upcomingCount} upcoming`,
    scheduling: plural(activeServiceCount, "active service"),
    clients: plural(clientCount, "record"),
    media: plural(mediaCount, "upload")
  };

  const quickCards = moduleRegistry.filter(
    (module) =>
      QUICK_ACCESS_MODULES.includes(module.id as ModuleId) && settings.enabledModuleIds.includes(module.id as ModuleId)
  );

  const progressPercent = onboarding.total ? Math.round((onboarding.completed / onboarding.total) * 100) : 0;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>{settings.businessName}</h1>
          <p>Everything you run day to day, in one place.</p>
        </div>
        <ButtonLink href="/" variant="secondary">
          <ExternalLink size={18} />
          View public site
        </ButtonLink>
      </header>

      {onboarding.total > 0 && !onboarding.allDone ? (
        <section className="onboarding-card" aria-label="Setup checklist">
          <div className="onboarding-head">
            <div>
              <p className="eyebrow">Getting started</p>
              <h2>Finish setting up your booking site</h2>
              <p>
                {onboarding.completed} of {onboarding.total} done — a few quick steps to start taking bookings.
              </p>
            </div>
            <span className="onboarding-progress-count" aria-hidden="true">
              {progressPercent}%
            </span>
          </div>
          <div className="onboarding-progress-track" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
            <span className="onboarding-progress-bar" style={{ width: `${progressPercent}%` }} />
          </div>
          <ol className="onboarding-steps">
            {onboarding.steps.map((step) => (
              <li className={`onboarding-step${step.done ? " is-done" : ""}`} key={step.id}>
                <span className="onboarding-step-icon" aria-hidden="true">
                  {step.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                </span>
                <span className="onboarding-step-body">
                  <strong>{step.title}</strong>
                  <small>{step.description}</small>
                </span>
                {step.done ? (
                  <span className="onboarding-step-state">Done</span>
                ) : (
                  <ButtonLink className="onboarding-step-cta" href={step.href} variant="secondary" size="sm">
                    {step.cta}
                    <ArrowRight size={15} />
                  </ButtonLink>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {onboarding.allDone ? (
        <section className="onboarding-card onboarding-card-done" aria-label="Setup complete">
          <div className="onboarding-done">
            <span className="onboarding-done-icon" aria-hidden="true">
              <CheckCircle2 size={24} />
            </span>
            <span className="onboarding-done-body">
              <strong>You&apos;re ready for customers</strong>
              <small>Your booking site is fully set up. Manage everything from the cards below.</small>
            </span>
            <ButtonLink href="/book" variant="secondary" size="sm">
              View booking page
            </ButtonLink>
          </div>
        </section>
      ) : null}

      <EqualGrid className="dashboard-stat-grid" min="180px" aria-label="Business snapshot">
        <StatTile href="/admin/modules/appointments" label="Upcoming" value={upcomingCount} detail="appointments ahead" />
        <StatTile href="/admin/modules/appointments" label="Needs review" value={pendingCount} detail="pending requests" />
        <StatTile href="/admin/modules/clients" label="Clients" value={clientCount} detail="saved records" />
        <StatTile href="/admin/modules/scheduling" label="Services" value={activeServiceCount} detail="active offerings" />
      </EqualGrid>

      {quickCards.length ? (
        <section className="stack" aria-label="Your workspace">
          <div className="page-header">
            <div>
              <h2>Your workspace</h2>
              <p>Jump straight into any area. Pinning your favorite cards here is coming soon.</p>
            </div>
          </div>

          <div className="quick-access-grid">
            {quickCards.map((module) => {
              const Icon = moduleIcons[module.icon];
              const metric = metricByModule[module.id as ModuleId];

              return (
                <article className="quick-access-card" key={module.id}>
                  <span className="quick-access-card-icon" aria-hidden="true">
                    <Icon size={20} />
                  </span>
                  <span className="quick-access-card-body">
                    <span className="quick-access-card-label">{module.label}</span>
                    {metric ? <strong>{metric}</strong> : null}
                    <small>{module.description}</small>
                  </span>
                  <ButtonLink className="quick-access-card-cta" href={module.href} variant="secondary" size="sm">
                    Open {module.label}
                    <ArrowRight size={15} />
                  </ButtonLink>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <Card
        as="section"
        className="dashboard-panel"
        minHeight="lg"
        reservedHeader={
          <div className="page-header">
            <div>
              <h2>Upcoming bookings</h2>
              <p>Your next appointments that still need attention.</p>
            </div>
            <ButtonLink variant="secondary" href="/admin/modules/appointments">
              <CalendarCheck size={18} />
              Manage appointments
            </ButtonLink>
          </div>
        }
      >
        {bookings.length ? (
          <>
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
              </tbody>
            </Table>

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
          </>
        ) : (
          <EmptyState title="No upcoming bookings" description="New bookings will appear here as customers reserve time." />
        )}
      </Card>
    </div>
  );
}
