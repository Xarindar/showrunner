import Link from "next/link";
import { AnalyticsEventType, BookingStatus, OrderStatus, PortfolioGalleryStatus, Prisma } from "@prisma/client";
import { BarChart3, CheckCircle2, MousePointerClick, Plus, TrendingUp } from "lucide-react";
import { enforceAnalyticsRetention } from "@/lib/analytics/retention";
import { requireAdmin } from "@/lib/auth";
import { enumLabel, formatDateTime, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { createAnalyticsGoalAction, recordAnalyticsEventAction, updateAnalyticsGoalStatusAction } from "./actions";

export const dynamic = "force-dynamic";

type AnalyticsPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

function eventDisplayName(eventType: AnalyticsEventType, eventName: string) {
  return eventName || enumLabel(eventType);
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = getKey(item) || "direct / unknown";
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count);
}

function goalWhere(goal: { eventType: AnalyticsEventType; eventName: string }, siteId: string): Prisma.AnalyticsEventWhereInput {
  return {
    siteId,
    eventType: goal.eventType,
    eventName: goal.eventName || undefined
  };
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  await requireAdmin("analytics:read");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  await enforceAnalyticsRetention(settings.siteId, settings.analyticsRetentionDays);
  const [
    recentEvents,
    goals,
    eventCount,
    bookingCount,
    completedBookingCount,
    leadSubmissionCount,
    publishedGalleryCount,
    galleryViewCount,
    favoriteCount,
    paidOrders,
    paidRevenue
  ] = await Promise.all([
    prisma.analyticsEvent.findMany({
      where: { siteId: settings.siteId },
      orderBy: { occurredAt: "desc" },
      take: 250
    }),
    prisma.analyticsGoal.findMany({
      where: { siteId: settings.siteId },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      take: 30
    }),
    prisma.analyticsEvent.count({ where: { siteId: settings.siteId } }),
    prisma.booking.count({ where: { siteId: settings.siteId } }),
    prisma.booking.count({ where: { siteId: settings.siteId, status: BookingStatus.COMPLETED } }),
    prisma.formSubmission.count({ where: { form: { siteId: settings.siteId } } }),
    prisma.portfolioGallery.count({ where: { siteId: settings.siteId, status: PortfolioGalleryStatus.PUBLISHED } }),
    prisma.analyticsEvent.count({ where: { siteId: settings.siteId, eventType: AnalyticsEventType.GALLERY_VIEWED } }),
    prisma.portfolioGalleryFavorite.count({ where: { gallery: { siteId: settings.siteId } } }),
    prisma.order.count({ where: { siteId: settings.siteId, status: OrderStatus.PAID } }),
    prisma.order.aggregate({
      where: { siteId: settings.siteId, status: OrderStatus.PAID },
      _sum: { totalCents: true }
    })
  ]);

  const goalProgress = await Promise.all(
    goals.map(async (goal) => {
      const progress = await prisma.analyticsEvent.aggregate({
        where: goalWhere(goal, settings.siteId),
        _count: { _all: true },
        _sum: { valueCents: true }
      });

      return {
        goalId: goal.id,
        count: progress._count._all,
        valueCents: progress._sum.valueCents || 0
      };
    })
  );
  const progressByGoal = new Map(goalProgress.map((progress) => [progress.goalId, progress]));
  const visibleEvents = recentEvents.slice(0, 20);
  const topEvents = countBy(recentEvents, (event) => eventDisplayName(event.eventType, event.eventName)).slice(0, 8);
  const topSources = countBy(recentEvents, (event) => [event.source, event.medium].filter(Boolean).join(" / ")).slice(0, 8);
  const savedMessage = params.saved ? "Analytics changes saved." : null;
  const errorMessage = params.error || null;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h1 style={{ fontSize: "2.4rem" }}>Events, attribution, and reporting</h1>
          <p>Track standard events, summarize module performance, and define conversion goals for future widgets and automations.</p>
        </div>
        <Link className="button secondary" href="/admin/modules/analytics/export">
          Export CSV
        </Link>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <section className="grid-3">
        <div className="card">
          <MousePointerClick size={22} />
          <h3>{eventCount} events</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Captured analytics rows across public pages, server events, manual records, and future embedded widgets.
          </p>
        </div>
        <div className="card">
          <CheckCircle2 size={22} />
          <h3>
            {completedBookingCount}/{bookingCount} bookings
          </h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Completed bookings compared with the total appointment queue.
          </p>
        </div>
        <div className="card">
          <TrendingUp size={22} />
          <h3>{formatMoney(paidRevenue._sum.totalCents || 0)}</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Paid order revenue across {paidOrders} paid commerce orders.
          </p>
        </div>
      </section>

      <section className="grid-3">
        <div className="card">
          <BarChart3 size={22} />
          <h3>{leadSubmissionCount} form leads</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Public form submissions available for lead attribution and follow-up.
          </p>
        </div>
        <div className="card">
          <BarChart3 size={22} />
          <h3>{publishedGalleryCount} published galleries</h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Portfolio surfaces that can emit gallery and proofing engagement.
          </p>
        </div>
        <div className="card">
          <BarChart3 size={22} />
          <h3>
            {galleryViewCount} views / {favoriteCount} favorites
          </h3>
          <p className="lead" style={{ fontSize: "0.95rem" }}>
            Gallery engagement from tracked events and proofing selections.
          </p>
        </div>
      </section>

      <section className="grid-2">
        <form action={recordAnalyticsEventAction} className="card form-grid">
          <h2 style={{ fontSize: "1.35rem" }}>Record manual event</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="event-type">Event type</label>
              <select id="event-type" name="eventType" defaultValue={AnalyticsEventType.CUSTOM}>
                {Object.values(AnalyticsEventType).map((type) => (
                  <option key={type} value={type}>
                    {enumLabel(type)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="event-name">Event name</label>
              <input id="event-name" name="eventName" placeholder="custom_event_name" />
            </div>
          </div>
          <div className="grid-3">
            <div className="field">
              <label htmlFor="event-source">Source</label>
              <input id="event-source" name="source" placeholder="google" />
            </div>
            <div className="field">
              <label htmlFor="event-medium">Medium</label>
              <input id="event-medium" name="medium" placeholder="organic" />
            </div>
            <div className="field">
              <label htmlFor="event-campaign">Campaign</label>
              <input id="event-campaign" name="campaign" />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="event-pathname">Pathname</label>
              <input id="event-pathname" name="pathname" placeholder="/book" />
            </div>
            <div className="field">
              <label htmlFor="event-landing">Landing page</label>
              <input id="event-landing" name="landingPage" placeholder="/" />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="event-client-email">Client email</label>
              <input id="event-client-email" name="clientEmail" type="email" />
            </div>
            <div className="field">
              <label htmlFor="event-referrer">Referrer</label>
              <input id="event-referrer" name="referrer" />
            </div>
          </div>
          <div className="grid-3">
            <div className="field">
              <label htmlFor="event-value">Value</label>
              <input id="event-value" name="value" inputMode="decimal" placeholder="125.00" />
            </div>
            <div className="field">
              <label htmlFor="event-currency">Currency</label>
              <input id="event-currency" name="currency" defaultValue="USD" maxLength={3} />
            </div>
            <div className="field">
              <label htmlFor="event-occurred">Occurred at</label>
              <input id="event-occurred" name="occurredAt" type="datetime-local" />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="event-related-type">Related type</label>
              <input id="event-related-type" name="relatedType" placeholder="booking" />
            </div>
            <div className="field">
              <label htmlFor="event-related-id">Related id</label>
              <input id="event-related-id" name="relatedId" />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="event-metadata-key">Metadata key</label>
              <input id="event-metadata-key" name="metadataKey" placeholder="service" />
            </div>
            <div className="field">
              <label htmlFor="event-metadata-value">Metadata value</label>
              <input id="event-metadata-value" name="metadataValue" />
            </div>
          </div>
          <button className="button" type="submit">
            <Plus size={18} />
            Record manual event
          </button>
        </form>

        <form action={createAnalyticsGoalAction} className="card form-grid">
          <h2 style={{ fontSize: "1.35rem" }}>Create conversion goal</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="goal-name">Name</label>
              <input id="goal-name" name="name" required />
            </div>
            <div className="field">
              <label htmlFor="goal-key">Key</label>
              <input id="goal-key" name="key" placeholder="bookings-completed" />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="goal-event-type">Event type</label>
              <select id="goal-event-type" name="eventType" defaultValue={AnalyticsEventType.BOOKING_COMPLETED}>
                {Object.values(AnalyticsEventType).map((type) => (
                  <option key={type} value={type}>
                    {enumLabel(type)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="goal-event-name">Event name</label>
              <input id="goal-event-name" name="eventName" placeholder="booking completed" />
            </div>
          </div>
          <div className="grid-3">
            <div className="field">
              <label htmlFor="goal-target-count">Target count</label>
              <input id="goal-target-count" name="targetCount" type="number" min="1" defaultValue="10" required />
            </div>
            <div className="field">
              <label htmlFor="goal-target-value">Target value</label>
              <input id="goal-target-value" name="targetValue" inputMode="decimal" />
            </div>
            <div className="field">
              <label htmlFor="goal-currency">Currency</label>
              <input id="goal-currency" name="currency" defaultValue="USD" maxLength={3} />
            </div>
          </div>
          <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
            <input name="isActive" type="checkbox" defaultChecked />
            Active
          </label>
          <button className="button secondary" type="submit">
            Add goal
          </button>
        </form>
      </section>

      <section className="grid-2">
        <div className="card stack">
          <h2 style={{ fontSize: "1.35rem" }}>Conversion goals</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Goal</th>
                <th>Progress</th>
                <th>State</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {goals.map((goal) => {
                const progress = progressByGoal.get(goal.id) || { count: 0, valueCents: 0 };
                const progressPercent = Math.min(100, Math.round((progress.count / Math.max(1, goal.targetCount)) * 100));

                return (
                  <tr key={goal.id}>
                    <td>
                      <strong>{goal.name}</strong>
                      <br />
                      <span style={{ color: "var(--muted)" }}>{eventDisplayName(goal.eventType, goal.eventName)}</span>
                    </td>
                    <td>
                      {progress.count}/{goal.targetCount}
                      {goal.targetValueCents ? ` - ${formatMoney(progress.valueCents, goal.currency)}` : ""}
                      <div style={{ background: "var(--bg)", borderRadius: 999, height: 8, marginTop: 6, overflow: "hidden" }}>
                        <div style={{ background: "var(--primary)", height: "100%", width: `${progressPercent}%` }} />
                      </div>
                    </td>
                    <td>
                      <span className={goal.isActive ? "pill success" : "pill danger"}>{goal.isActive ? "active" : "paused"}</span>
                    </td>
                    <td>
                      <form action={updateAnalyticsGoalStatusAction}>
                        <input type="hidden" name="id" value={goal.id} />
                        <input type="hidden" name="isActive" value={goal.isActive ? "false" : "true"} />
                        <button className="button secondary" type="submit">
                          {goal.isActive ? "Pause" : "Activate"}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {!goals.length ? (
                <tr>
                  <td colSpan={4}>No conversion goals yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="card stack">
          <h2 style={{ fontSize: "1.35rem" }}>Top events</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {topEvents.map((event) => (
                <tr key={event.label}>
                  <td>{event.label}</td>
                  <td>{event.count}</td>
                </tr>
              ))}
              {!topEvents.length ? (
                <tr>
                  <td colSpan={2}>No events recorded yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid-2">
        <div className="card stack">
          <h2 style={{ fontSize: "1.35rem" }}>Source attribution</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Events</th>
              </tr>
            </thead>
            <tbody>
              {topSources.map((source) => (
                <tr key={source.label}>
                  <td>{source.label}</td>
                  <td>{source.count}</td>
                </tr>
              ))}
              {!topSources.length ? (
                <tr>
                  <td colSpan={2}>No source data yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="card stack">
          <h2 style={{ fontSize: "1.35rem" }}>Recent events</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Source</th>
                <th>Value</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {visibleEvents.map((event) => (
                <tr key={event.id}>
                  <td>
                    <strong>{eventDisplayName(event.eventType, event.eventName)}</strong>
                    <br />
                    <span style={{ color: "var(--muted)" }}>{event.pathname || event.relatedType || "No path"}</span>
                  </td>
                  <td>{[event.source, event.medium].filter(Boolean).join(" / ") || "direct / unknown"}</td>
                  <td>{event.valueCents ? formatMoney(event.valueCents, event.currency) : "-"}</td>
                  <td>{formatDateTime(event.occurredAt, settings.timezone)}</td>
                </tr>
              ))}
              {!visibleEvents.length ? (
                <tr>
                  <td colSpan={4}>No recent events yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
