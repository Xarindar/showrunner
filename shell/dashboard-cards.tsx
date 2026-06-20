import "server-only";

import type { ReactNode } from "react";
import { Prisma } from "@prisma/client";
import { Badge, DashboardCardList, DashboardKpiRow, DashboardMetric, DashboardTrendBars } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { addDaysToDateKey, getTodayDateKey, getZonedDayBounds, parseZonedDateKey } from "@/lib/timezone";
import {
  dashboardCardSizeFromLayout,
  dashboardCardSizes,
  getDashboardCardLayoutDefaults,
  normalizeDashboardCardColumns,
  normalizeDashboardCardRows,
  type DashboardCardSize
} from "@/shell/dashboard-layout";
import { moduleRegistry, type ModuleId } from "@/shell/modules";

export type DashboardCardPlacement = {
  cardId: string;
  columns: number;
  instanceId: string;
  order: number;
  rows: number;
  size: DashboardCardSize;
};

type DashboardCardRenderContext = {
  siteId: string;
  size: DashboardCardSize;
  timezone: string;
};

export type DashboardCardDefinition = {
  defaultSize: DashboardCardSize;
  description: string;
  id: string;
  moduleId: ModuleId;
  render: (context: DashboardCardRenderContext) => Promise<ReactNode>;
  sizes: DashboardCardSize[];
  title: string;
};

const dashboardModuleId: ModuleId = "dashboard";
const dashboardCardSettingPrefix = "dashboard.cards.";
const defaultDashboardCardIds = [
  "appointments.today",
  "appointments.pending",
  "clients.recent",
  "scheduling.services"
] as const;

function limitForSize(size: DashboardCardSize) {
  if (size === "sm") return 1;
  if (size === "md") return 3;
  return 6;
}

function normalizeSize(value: unknown, fallback: DashboardCardSize): DashboardCardSize {
  return dashboardCardSizes.includes(value as DashboardCardSize) ? (value as DashboardCardSize) : fallback;
}

function timeLabel(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone
  }).format(value);
}

function shortDateLabel(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: timezone
  }).format(value);
}

function weekDayLabel(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    weekday: "short"
  }).format(value);
}

function safeJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function renderAppointmentsToday({ siteId, size, timezone }: DashboardCardRenderContext) {
  const { start, end } = getZonedDayBounds(new Date(), timezone);
  const limit = limitForSize(size);
  const [count, pendingCount, bookings] = await Promise.all([
    prisma.booking.count({
      where: {
        siteId,
        startsAt: { gte: start, lt: end },
        status: { not: "CANCELED" }
      }
    }),
    prisma.booking.count({
      where: {
        siteId,
        startsAt: { gte: start, lt: end },
        status: "PENDING"
      }
    }),
    prisma.booking.findMany({
      include: { service: true, staff: true },
      orderBy: { startsAt: "asc" },
      take: limit,
      where: {
        siteId,
        startsAt: { gte: start, lt: end },
        status: { not: "CANCELED" }
      }
    })
  ]);

  return (
    <>
      <DashboardMetric detail={`${pendingCount} pending`} label="Appointments today" value={count} />
      {size !== "sm" ? (
        <DashboardCardList
          empty="No appointments are scheduled for today."
          items={bookings.map((booking) => ({
            detail: booking.service.name,
            href: `/admin/appointments/${booking.id}`,
            meta: timeLabel(booking.startsAt, timezone),
            title: booking.customerName
          }))}
        />
      ) : null}
    </>
  );
}

async function renderPendingAppointments({ siteId, size, timezone }: DashboardCardRenderContext) {
  const limit = limitForSize(size);
  const [count, bookings] = await Promise.all([
    prisma.booking.count({ where: { siteId, status: "PENDING" } }),
    prisma.booking.findMany({
      include: { service: true },
      orderBy: { startsAt: "asc" },
      take: limit,
      where: { siteId, status: "PENDING" }
    })
  ]);

  return (
    <>
      <DashboardMetric detail="requests waiting for confirmation" label="Needs review" value={count} />
      {size !== "sm" ? (
        <DashboardCardList
          empty="No appointment requests need review."
          items={bookings.map((booking) => ({
            detail: booking.service.name,
            href: `/admin/appointments/${booking.id}`,
            meta: shortDateLabel(booking.startsAt, timezone),
            title: booking.customerName
          }))}
        />
      ) : null}
    </>
  );
}

async function renderClientsRecent({ siteId, size, timezone }: DashboardCardRenderContext) {
  const limit = limitForSize(size);
  const [count, activeCount, recentClients] = await Promise.all([
    prisma.client.count({ where: { siteId } }),
    prisma.client.count({ where: { siteId, status: "active" } }),
    prisma.client.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      where: { siteId }
    })
  ]);

  return (
    <>
      <DashboardMetric detail={`${activeCount} active`} label="Client records" value={count} />
      {size !== "sm" ? (
        <DashboardCardList
          empty="No clients have been added yet."
          items={recentClients.map((client) => ({
            detail: client.email,
            href: `/admin/clients/${client.id}`,
            meta: shortDateLabel(client.updatedAt, timezone),
            title: client.name
          }))}
        />
      ) : null}
    </>
  );
}

async function renderSchedulingServices({ siteId, size }: DashboardCardRenderContext) {
  const limit = limitForSize(size);
  const [activeCount, staffCount, resourceCount, services] = await Promise.all([
    prisma.service.count({ where: { siteId, isActive: true } }),
    prisma.staffMember.count({ where: { siteId, isActive: true } }),
    prisma.resource.count({ where: { siteId, isActive: true } }),
    prisma.service.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      take: limit,
      where: { siteId }
    })
  ]);

  return (
    <>
      <DashboardMetric detail={`${staffCount} staff, ${resourceCount} resources`} label="Active services" value={activeCount} />
      {size !== "sm" ? (
        <DashboardCardList
          empty="No services are configured yet."
          items={services.map((service) => ({
            detail: `${service.durationMinutes} min${service.requestOnly ? " request-only" : ""}`,
            meta: service.isActive ? <Badge>active</Badge> : <Badge>draft</Badge>,
            title: service.name
          }))}
        />
      ) : null}
    </>
  );
}

async function renderMediaRecent({ siteId, size, timezone }: DashboardCardRenderContext) {
  const limit = limitForSize(size);
  const [count, privateCount, assets] = await Promise.all([
    prisma.mediaAsset.count({ where: { siteId, deletedAt: null } }),
    prisma.mediaAsset.count({ where: { siteId, deletedAt: null, isPrivate: true } }),
    prisma.mediaAsset.findMany({
      include: { variants: { where: { type: "THUMBNAIL" }, take: 1 } },
      orderBy: { createdAt: "desc" },
      take: limit,
      where: { siteId, deletedAt: null }
    })
  ]);

  return (
    <>
      <DashboardMetric detail={`${privateCount} private`} label="Media assets" value={count} />
      {size === "lg" && assets.length ? (
        <div className="dashboard-card-media-grid">
          {assets.map((asset) => {
            const thumbnailUrl = asset.variants[0]?.url || asset.url;

            return (
              <span
                aria-label={asset.alt || asset.filename}
                key={asset.id}
                role="img"
                style={{ backgroundImage: `url(${JSON.stringify(thumbnailUrl)})` }}
              />
            );
          })}
        </div>
      ) : size !== "sm" ? (
        <DashboardCardList
          empty="No media has been uploaded yet."
          items={assets.map((asset) => ({
            detail: asset.folder || asset.mimeType || "Media asset",
            meta: shortDateLabel(asset.createdAt, timezone),
            title: asset.filename
          }))}
        />
      ) : null}
    </>
  );
}

async function renderFormsSubmissions({ siteId, size, timezone }: DashboardCardRenderContext) {
  const limit = limitForSize(size);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [activeForms, recentCount, submissions] = await Promise.all([
    prisma.form.count({ where: { siteId, status: "ACTIVE" } }),
    prisma.formSubmission.count({ where: { form: { siteId }, createdAt: { gte: sevenDaysAgo } } }),
    prisma.formSubmission.findMany({
      include: { form: true },
      orderBy: { createdAt: "desc" },
      take: limit,
      where: { form: { siteId } }
    })
  ]);

  return (
    <>
      <DashboardMetric detail={`${activeForms} active forms`} label="Submissions this week" value={recentCount} />
      {size !== "sm" ? (
        <DashboardCardList
          empty="No form submissions have arrived yet."
          items={submissions.map((submission) => ({
            detail: submission.form.name,
            meta: shortDateLabel(submission.createdAt, timezone),
            title: submission.submitterName || submission.submitterEmail || "Anonymous submission"
          }))}
        />
      ) : null}
    </>
  );
}

async function renderProductsOrders({ siteId, size }: DashboardCardRenderContext) {
  const limit = limitForSize(size);
  const [activeProducts, pendingOrders, paidRevenue, orders] = await Promise.all([
    prisma.product.count({ where: { siteId, status: "ACTIVE" } }),
    prisma.order.count({ where: { siteId, status: "PENDING" } }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { siteId, status: { in: ["PAID", "FULFILLED"] } }
    }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      where: { siteId }
    })
  ]);

  return (
    <>
      <DashboardMetric detail={`${activeProducts} active products, ${pendingOrders} pending orders`} label="Paid revenue" value={formatMoney(paidRevenue._sum.totalCents || 0)} />
      {size !== "sm" ? (
        <DashboardCardList
          empty="No orders have been created yet."
          items={orders.map((order) => ({
            detail: `${order.customerName} - ${formatMoney(order.totalCents, order.currency)}`,
            meta: <Badge>{order.status.toLowerCase()}</Badge>,
            title: order.orderNumber
          }))}
        />
      ) : null}
    </>
  );
}

async function renderPaymentsHealth({ siteId, size, timezone }: DashboardCardRenderContext) {
  const limit = limitForSize(size);
  const [connectedCount, erroredCount, payments] = await Promise.all([
    prisma.paymentGatewayCredential.count({ where: { siteId, status: "CONNECTED" } }),
    prisma.paymentGatewayCredential.count({ where: { siteId, status: "ERROR" } }),
    prisma.payment.findMany({
      include: { order: true },
      orderBy: { createdAt: "desc" },
      take: limit,
      where: { order: { siteId } }
    })
  ]);

  return (
    <>
      <DashboardMetric detail={`${erroredCount} connections need attention`} label="Connected gateways" value={connectedCount} />
      {size !== "sm" ? (
        <DashboardCardList
          empty="No payments have been recorded yet."
          items={payments.map((payment) => ({
            detail: `${payment.order.orderNumber} - ${formatMoney(payment.amountCents, payment.currency)}`,
            meta: shortDateLabel(payment.createdAt, timezone),
            title: payment.provider.toLowerCase()
          }))}
        />
      ) : null}
    </>
  );
}

async function renderCommunicationsOutbox({ siteId, size, timezone }: DashboardCardRenderContext) {
  const limit = limitForSize(size);
  const [queuedCount, failedCount, sentCount, outbox] = await Promise.all([
    prisma.emailOutbox.count({ where: { siteId, status: "QUEUED" } }),
    prisma.emailOutbox.count({ where: { siteId, status: "FAILED" } }),
    prisma.emailOutbox.count({ where: { siteId, status: "SENT" } }),
    prisma.emailOutbox.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      where: { siteId }
    })
  ]);

  return (
    <>
      <DashboardMetric detail={`${failedCount} failed, ${sentCount} sent total`} label="Queued messages" value={queuedCount} />
      {size !== "sm" ? (
        <DashboardCardList
          empty="No email outbox activity yet."
          items={outbox.map((message) => ({
            detail: message.recipientEmail,
            meta: shortDateLabel(message.updatedAt, timezone),
            title: message.subject || message.templateKey || message.purpose
          }))}
        />
      ) : null}
    </>
  );
}

async function renderAutomationQueue({ siteId, size, timezone }: DashboardCardRenderContext) {
  const limit = limitForSize(size);
  const [activeAutomations, openTasks, failedRuns, runs] = await Promise.all([
    prisma.automation.count({ where: { siteId, status: "ACTIVE" } }),
    prisma.automationTask.count({ where: { siteId, status: "OPEN" } }),
    prisma.automationRun.count({ where: { automation: { siteId }, status: "FAILED" } }),
    prisma.automationRun.findMany({
      include: { automation: true },
      orderBy: { createdAt: "desc" },
      take: limit,
      where: { automation: { siteId } }
    })
  ]);

  return (
    <>
      <DashboardMetric detail={`${openTasks} open tasks, ${failedRuns} failed runs`} label="Active automations" value={activeAutomations} />
      {size !== "sm" ? (
        <DashboardCardList
          empty="No automation runs have happened yet."
          items={runs.map((run) => ({
            detail: run.summary || run.triggerKey || run.automation.action.toLowerCase(),
            meta: shortDateLabel(run.createdAt, timezone),
            title: run.automation.name
          }))}
        />
      ) : null}
    </>
  );
}

async function renderPortfolioProofing({ siteId, size, timezone }: DashboardCardRenderContext) {
  const limit = limitForSize(size);
  const [publishedGalleries, openRounds, recentRounds] = await Promise.all([
    prisma.portfolioGallery.count({ where: { siteId, status: "PUBLISHED" } }),
    prisma.portfolioProofRound.count({ where: { siteId, status: { in: ["OPEN", "CHANGES_REQUESTED"] } } }),
    prisma.portfolioProofRound.findMany({
      include: { gallery: true },
      orderBy: { updatedAt: "desc" },
      take: limit,
      where: { siteId, status: { in: ["OPEN", "CHANGES_REQUESTED"] } }
    })
  ]);

  return (
    <>
      <DashboardMetric detail={`${publishedGalleries} published galleries`} label="Open proof rounds" value={openRounds} />
      {size !== "sm" ? (
        <DashboardCardList
          empty="No proof rounds are open."
          items={recentRounds.map((round) => ({
            detail: round.gallery.title,
            meta: shortDateLabel(round.updatedAt, timezone),
            title: round.title || `Round ${round.roundNumber}`
          }))}
        />
      ) : null}
    </>
  );
}

async function renderTestimonialsInbox({ siteId, size }: DashboardCardRenderContext) {
  const limit = limitForSize(size);
  const [pendingCount, approvedCount, testimonials] = await Promise.all([
    prisma.testimonial.count({ where: { siteId, status: "PENDING" } }),
    prisma.testimonial.count({ where: { siteId, status: "APPROVED" } }),
    prisma.testimonial.findMany({
      orderBy: { submittedAt: "desc" },
      take: limit,
      where: { siteId, status: "PENDING" }
    })
  ]);

  return (
    <>
      <DashboardMetric detail={`${approvedCount} approved`} label="Pending testimonials" value={pendingCount} />
      {size !== "sm" ? (
        <DashboardCardList
          empty="No testimonials are waiting for approval."
          items={testimonials.map((testimonial) => ({
            detail: testimonial.quote,
            meta: `${testimonial.rating}/5`,
            title: testimonial.authorName
          }))}
        />
      ) : null}
    </>
  );
}

async function renderBillingDesk({ siteId, size, timezone }: DashboardCardRenderContext) {
  const limit = limitForSize(size);
  const [sentCount, overdueCount, openTotal, documents] = await Promise.all([
    prisma.billingDocument.count({ where: { siteId, type: "INVOICE", status: "SENT" } }),
    prisma.billingDocument.count({ where: { siteId, type: "INVOICE", status: "OVERDUE" } }),
    prisma.billingDocument.aggregate({
      _sum: { totalCents: true },
      where: { siteId, type: "INVOICE", status: { in: ["SENT", "OVERDUE"] } }
    }),
    prisma.billingDocument.findMany({
      orderBy: [{ status: "desc" }, { updatedAt: "desc" }],
      take: limit,
      where: { siteId, type: "INVOICE", status: { in: ["SENT", "OVERDUE"] } }
    })
  ]);

  return (
    <>
      <DashboardMetric detail={`${sentCount} sent, ${overdueCount} overdue`} label="Open invoice total" value={formatMoney(openTotal._sum.totalCents || 0)} />
      {size !== "sm" ? (
        <DashboardCardList
          empty="No invoices are currently open."
          items={documents.map((document) => ({
            detail: `${document.customerName} - ${formatMoney(document.totalCents, document.currency)}`,
            meta: document.dueAt ? shortDateLabel(document.dueAt, timezone) : <Badge>{document.status.toLowerCase()}</Badge>,
            title: document.documentNumber
          }))}
        />
      ) : null}
    </>
  );
}

async function renderAnalyticsActivity({ siteId, size, timezone }: DashboardCardRenderContext) {
  const todayKey = getTodayDateKey(timezone);
  const dayKeys = Array.from({ length: 7 }, (_, index) => addDaysToDateKey(todayKey, index - 6));
  const windows = dayKeys.map((dateKey) => {
    const start = parseZonedDateKey(dateKey, timezone) || new Date();
    const end = parseZonedDateKey(addDaysToDateKey(dateKey, 1), timezone) || new Date();
    return { dateKey, end, start };
  });
  const sevenDaysAgo = windows[0]?.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [eventCount, bookingCount, leadCount, dayCounts] = await Promise.all([
    prisma.analyticsEvent.count({ where: { siteId, occurredAt: { gte: sevenDaysAgo } } }),
    prisma.analyticsEvent.count({ where: { siteId, eventType: "BOOKING_COMPLETED", occurredAt: { gte: sevenDaysAgo } } }),
    prisma.analyticsEvent.count({ where: { siteId, eventType: "LEAD_SUBMITTED", occurredAt: { gte: sevenDaysAgo } } }),
    Promise.all(
      windows.map((window) =>
        prisma.analyticsEvent.count({
          where: {
            siteId,
            occurredAt: { gte: window.start, lt: window.end }
          }
        })
      )
    )
  ]);

  return (
    <>
      <DashboardMetric detail={`${bookingCount} bookings, ${leadCount} leads`} label="Events this week" value={eventCount} />
      {size === "lg" ? (
        <DashboardTrendBars
          bars={windows.map((window, index) => ({
            label: weekDayLabel(window.start, timezone),
            value: dayCounts[index] || 0
          }))}
        />
      ) : size === "md" ? (
        <DashboardKpiRow
          items={[
            { label: "Bookings", value: bookingCount },
            { label: "Leads", value: leadCount },
            { label: "Daily avg", value: Math.round(eventCount / 7) }
          ]}
        />
      ) : null}
    </>
  );
}

export const dashboardCardDefinitions: DashboardCardDefinition[] = [
  {
    defaultSize: "lg",
    description: "The day's appointment queue with more detail at larger sizes.",
    id: "appointments.today",
    moduleId: "appointments",
    render: renderAppointmentsToday,
    sizes: ["sm", "md", "lg"],
    title: "Today's appointments"
  },
  {
    defaultSize: "md",
    description: "Appointment requests that need confirmation.",
    id: "appointments.pending",
    moduleId: "appointments",
    render: renderPendingAppointments,
    sizes: ["sm", "md", "lg"],
    title: "Pending appointments"
  },
  {
    defaultSize: "md",
    description: "Recent client records and the size of the CRM.",
    id: "clients.recent",
    moduleId: "clients",
    render: renderClientsRecent,
    sizes: ["sm", "md", "lg"],
    title: "Recent clients"
  },
  {
    defaultSize: "md",
    description: "Active services, staff, and resource coverage.",
    id: "scheduling.services",
    moduleId: "scheduling",
    render: renderSchedulingServices,
    sizes: ["sm", "md", "lg"],
    title: "Scheduling setup"
  },
  {
    defaultSize: "md",
    description: "Latest uploads, with thumbnails when the card is large.",
    id: "media.recent",
    moduleId: "media",
    render: renderMediaRecent,
    sizes: ["sm", "md", "lg"],
    title: "Recent media"
  },
  {
    defaultSize: "md",
    description: "New form submissions and active intake surfaces.",
    id: "forms.submissions",
    moduleId: "forms",
    render: renderFormsSubmissions,
    sizes: ["sm", "md", "lg"],
    title: "Form submissions"
  },
  {
    defaultSize: "md",
    description: "Product readiness and recent order flow.",
    id: "products.orders",
    moduleId: "products",
    render: renderProductsOrders,
    sizes: ["sm", "md", "lg"],
    title: "Commerce orders"
  },
  {
    defaultSize: "md",
    description: "Gateway health and recent payment activity.",
    id: "payments.health",
    moduleId: "payments",
    render: renderPaymentsHealth,
    sizes: ["sm", "md", "lg"],
    title: "Payment health"
  },
  {
    defaultSize: "md",
    description: "Queued, failed, and recent outbound email.",
    id: "communications.outbox",
    moduleId: "communications",
    render: renderCommunicationsOutbox,
    sizes: ["sm", "md", "lg"],
    title: "Communications outbox"
  },
  {
    defaultSize: "md",
    description: "Automation health, open tasks, and recent runs.",
    id: "automation.queue",
    moduleId: "automation",
    render: renderAutomationQueue,
    sizes: ["sm", "md", "lg"],
    title: "Automation queue"
  },
  {
    defaultSize: "md",
    description: "Open proofing rounds and published gallery coverage.",
    id: "portfolio.proofing",
    moduleId: "portfolio",
    render: renderPortfolioProofing,
    sizes: ["sm", "md", "lg"],
    title: "Portfolio proofing"
  },
  {
    defaultSize: "md",
    description: "Testimonials waiting for review.",
    id: "testimonials.inbox",
    moduleId: "testimonials",
    render: renderTestimonialsInbox,
    sizes: ["sm", "md", "lg"],
    title: "Testimonial inbox"
  },
  {
    defaultSize: "md",
    description: "Open invoice value and documents needing attention.",
    id: "billing.desk",
    moduleId: "billing",
    render: renderBillingDesk,
    sizes: ["sm", "md", "lg"],
    title: "Billing desk"
  },
  {
    defaultSize: "lg",
    description: "Standard analytics activity trend for the last seven days.",
    id: "analytics.activity",
    moduleId: "analytics",
    render: renderAnalyticsActivity,
    sizes: ["sm", "md", "lg"],
    title: "Analytics activity"
  }
];

const dashboardCardById = new Map(dashboardCardDefinitions.map((card) => [card.id, card]));

export function dashboardCardSettingKey(userId: string) {
  return `${dashboardCardSettingPrefix}${userId}`;
}

export function getDashboardCardDefinition(cardId: string) {
  return dashboardCardById.get(cardId) || null;
}

export function getAvailableDashboardCards(enabledModuleIds: ModuleId[]) {
  const enabled = new Set<ModuleId>([dashboardModuleId, ...enabledModuleIds]);
  return dashboardCardDefinitions.filter((card) => enabled.has(card.moduleId));
}

export function getDashboardCardModule(card: DashboardCardDefinition) {
  return moduleRegistry.find((shellModule) => shellModule.id === card.moduleId) || null;
}

export function normalizeDashboardCardSize(cardId: string, value: unknown) {
  const card = getDashboardCardDefinition(cardId);
  const requested = normalizeSize(value, card?.defaultSize || "md");
  return card?.sizes.includes(requested) ? requested : card?.defaultSize || "md";
}

export function normalizeDashboardCardPlacements(
  value: unknown,
  enabledModuleIds: ModuleId[],
  options: { useDefaults?: boolean } = {}
) {
  const available = new Set(getAvailableDashboardCards(enabledModuleIds).map((card) => card.id));
  const source = Array.isArray(value) ? value : [];
  const seenCards = new Set<string>();
  const normalized: DashboardCardPlacement[] = [];

  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const cardId = typeof record.cardId === "string" ? record.cardId : "";
    if (!available.has(cardId) || seenCards.has(cardId)) continue;
    const card = getDashboardCardDefinition(cardId);
    if (!card) continue;
    const instanceId = typeof record.instanceId === "string" && record.instanceId.trim() ? record.instanceId : cardId;
    const requestedSize = normalizeDashboardCardSize(cardId, record.size);
    const fallbackLayout = getDashboardCardLayoutDefaults(requestedSize);
    const columns = normalizeDashboardCardColumns(record.columns, fallbackLayout.columns);
    const rows = normalizeDashboardCardRows(record.rows, fallbackLayout.rows);
    normalized.push({
      cardId,
      columns,
      instanceId,
      order: normalized.length,
      rows,
      size: normalizeDashboardCardSize(cardId, dashboardCardSizeFromLayout(columns, rows))
    });
    seenCards.add(cardId);
  }

  if (!normalized.length && options.useDefaults) {
    return defaultDashboardCardIds
      .filter((cardId) => available.has(cardId))
      .map((cardId, order) => {
        const card = getDashboardCardDefinition(cardId);
        const defaultSize = card?.defaultSize || "md";
        const defaultLayout = getDashboardCardLayoutDefaults(defaultSize);
        return {
          cardId,
          columns: defaultLayout.columns,
          instanceId: cardId,
          order,
          rows: defaultLayout.rows,
          size: defaultSize
        };
      });
  }

  return normalized;
}

export async function getDashboardCardPlacements(siteId: string, userId: string, enabledModuleIds: ModuleId[]) {
  const setting = await prisma.moduleSetting.findUnique({
    where: {
      siteId_moduleId_key: {
        key: dashboardCardSettingKey(userId),
        moduleId: dashboardModuleId,
        siteId
      }
    }
  });

  return normalizeDashboardCardPlacements(setting?.value, enabledModuleIds, { useDefaults: !setting });
}

export async function saveDashboardCardPlacements(siteId: string, userId: string, placements: DashboardCardPlacement[]) {
  await prisma.moduleInstallation.upsert({
    create: {
      enabled: true,
      installed: true,
      moduleId: dashboardModuleId,
      siteId
    },
    update: {
      enabled: true,
      installed: true
    },
    where: {
      siteId_moduleId: {
        moduleId: dashboardModuleId,
        siteId
      }
    }
  });

  await prisma.moduleSetting.upsert({
    create: {
      key: dashboardCardSettingKey(userId),
      moduleId: dashboardModuleId,
      siteId,
      value: safeJsonValue(placements)
    },
    update: {
      value: safeJsonValue(placements)
    },
    where: {
      siteId_moduleId_key: {
        key: dashboardCardSettingKey(userId),
        moduleId: dashboardModuleId,
        siteId
      }
    }
  });
}

export function dashboardCardCatalogGroups(enabledModuleIds: ModuleId[], placements: DashboardCardPlacement[]) {
  const placed = new Set(placements.map((placement) => placement.cardId));
  const cards = getAvailableDashboardCards(enabledModuleIds).filter((card) => !placed.has(card.id));

  return moduleRegistry
    .map((shellModule) => ({
      cards: cards.filter((card) => card.moduleId === shellModule.id),
      module: shellModule
    }))
    .filter((group) => group.cards.length);
}

export function placedDashboardCards(placements: DashboardCardPlacement[]) {
  return placements
    .map((placement) => {
      const card = getDashboardCardDefinition(placement.cardId);
      const shellModule = card ? getDashboardCardModule(card) : null;
      return card && shellModule ? { card, module: shellModule, placement } : null;
    })
    .filter((item): item is { card: DashboardCardDefinition; module: NonNullable<ReturnType<typeof getDashboardCardModule>>; placement: DashboardCardPlacement } => Boolean(item));
}
