import { AnalyticsEventType, BookingStatus, OrderStatus, PortfolioGalleryStatus, Prisma } from "@prisma/client";
import { Plus } from "lucide-react";
import { enforceAnalyticsRetention } from "@/lib/analytics/retention";
import { requireAdmin } from "@/lib/auth";
import { enumLabel, formatDateTime, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { Badge, Button, ButtonLink, Card, EqualGrid, Feedback, Field, Input, Select, Stack, StatTile, Table } from "@/components/ui";
import { ModuleActionModals } from "@/components/ui/module-action-modals";
import { createAnalyticsGoalAction, recordAnalyticsEventAction, updateAnalyticsGoalStatusAction } from "./actions";

export const dynamic = "force-dynamic";

type AnalyticsPageProps = {
  searchParams: Promise<{saved?: string;error?: string;}>;
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

  return [...counts.entries()].
  map(([label, count]) => ({ label, count })).
  sort((left, right) => right.count - left.count);
}

function goalWhere(goal: {eventType: AnalyticsEventType;eventName: string;}, siteId: string): Prisma.AnalyticsEventWhereInput {
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
  paidRevenue] =
  await Promise.all([
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
  })]
  );

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
  const recordEventForm = (
    <form action={recordAnalyticsEventAction} className="form-grid">
      <EqualGrid>
        <Field label="Event type" htmlFor="event-type">
          <Select id="event-type" name="eventType" defaultValue={AnalyticsEventType.CUSTOM}>
            {Object.values(AnalyticsEventType).map((type) => (
              <option key={type} value={type}>
                {enumLabel(type)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Event name" htmlFor="event-name">
          <Input id="event-name" name="eventName" placeholder="custom_event_name" />
        </Field>
      </EqualGrid>
      <EqualGrid min="220px">
        <Field label="Source" htmlFor="event-source"><Input id="event-source" name="source" placeholder="google" /></Field>
        <Field label="Medium" htmlFor="event-medium"><Input id="event-medium" name="medium" placeholder="organic" /></Field>
        <Field label="Campaign" htmlFor="event-campaign"><Input id="event-campaign" name="campaign" /></Field>
      </EqualGrid>
      <EqualGrid>
        <Field label="Pathname" htmlFor="event-pathname"><Input id="event-pathname" name="pathname" placeholder="/book" /></Field>
        <Field label="Landing page" htmlFor="event-landing"><Input id="event-landing" name="landingPage" placeholder="/" /></Field>
      </EqualGrid>
      <EqualGrid>
        <Field label="Client email" htmlFor="event-client-email"><Input id="event-client-email" name="clientEmail" type="email" /></Field>
        <Field label="Referrer" htmlFor="event-referrer"><Input id="event-referrer" name="referrer" /></Field>
      </EqualGrid>
      <EqualGrid min="220px">
        <Field label="Value" htmlFor="event-value"><Input id="event-value" name="value" inputMode="decimal" placeholder="125.00" /></Field>
        <Field label="Currency" htmlFor="event-currency"><Input id="event-currency" name="currency" defaultValue="USD" maxLength={3} /></Field>
        <Field label="Occurred at" htmlFor="event-occurred"><Input id="event-occurred" name="occurredAt" type="datetime-local" /></Field>
      </EqualGrid>
      <EqualGrid>
        <Field label="Related type" htmlFor="event-related-type"><Input id="event-related-type" name="relatedType" placeholder="booking" /></Field>
        <Field label="Related id" htmlFor="event-related-id"><Input id="event-related-id" name="relatedId" /></Field>
      </EqualGrid>
      <EqualGrid>
        <Field label="Metadata key" htmlFor="event-metadata-key"><Input id="event-metadata-key" name="metadataKey" placeholder="service" /></Field>
        <Field label="Metadata value" htmlFor="event-metadata-value"><Input id="event-metadata-value" name="metadataValue" /></Field>
      </EqualGrid>
      <div className="module-modal-actions">
        <Button type="submit">
          <Plus size={18} />
          Record manual event
        </Button>
      </div>
    </form>
  );
  const createGoalForm = (
    <form action={createAnalyticsGoalAction} className="form-grid">
      <EqualGrid>
        <Field label="Name" htmlFor="goal-name"><Input id="goal-name" name="name" required /></Field>
        <Field label="Key" htmlFor="goal-key"><Input id="goal-key" name="key" placeholder="bookings-completed" /></Field>
      </EqualGrid>
      <EqualGrid>
        <Field label="Event type" htmlFor="goal-event-type">
          <Select id="goal-event-type" name="eventType" defaultValue={AnalyticsEventType.BOOKING_COMPLETED}>
            {Object.values(AnalyticsEventType).map((type) => (
              <option key={type} value={type}>
                {enumLabel(type)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Event name" htmlFor="goal-event-name"><Input id="goal-event-name" name="eventName" placeholder="booking completed" /></Field>
      </EqualGrid>
      <EqualGrid min="220px">
        <Field label="Target count" htmlFor="goal-target-count"><Input id="goal-target-count" name="targetCount" type="number" min="1" defaultValue="10" required /></Field>
        <Field label="Target value" htmlFor="goal-target-value"><Input id="goal-target-value" name="targetValue" inputMode="decimal" /></Field>
        <Field label="Currency" htmlFor="goal-currency"><Input id="goal-currency" name="currency" defaultValue="USD" maxLength={3} /></Field>
      </EqualGrid>
      <label className="ui-check-row">
        <input name="isActive" type="checkbox" defaultChecked />
        Active
      </label>
      <div className="module-modal-actions">
        <Button variant="secondary" type="submit">
          Add goal
        </Button>
      </div>
    </form>
  );

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h1>Events, attribution, and reporting</h1>
          <p>Track standard events, summarize module performance, and define conversion goals for future widgets and automations.</p>
        </div>
        <ButtonLink variant="secondary" href="/admin/modules/analytics/export">
          Export CSV
        </ButtonLink>
      </header>

      {savedMessage ? <Feedback tone="success">{savedMessage}</Feedback> : null}
      {errorMessage ? <Feedback tone="danger">{errorMessage}</Feedback> : null}

      <EqualGrid min="220px" aria-label="Analytics summary">
        <StatTile label="Events" value={eventCount} detail="Captured across public pages, server events, manual records, and widgets." />
        <StatTile label="Bookings" value={`${completedBookingCount}/${bookingCount}`} detail="Completed bookings compared with the appointment queue." />
        <StatTile label="Paid revenue" value={formatMoney(paidRevenue._sum.totalCents || 0)} detail={`Across ${paidOrders} paid commerce orders.`} />
        <StatTile label="Form leads" value={leadSubmissionCount} detail="Public form submissions available for attribution and follow-up." />
        <StatTile label="Published galleries" value={publishedGalleryCount} detail="Portfolio surfaces emitting gallery and proofing engagement." />
        <StatTile label="Gallery engagement" value={`${galleryViewCount} / ${favoriteCount}`} detail="Tracked gallery views and proofing favorites." />
      </EqualGrid>

      <EqualGrid as="section">
        <Card as="section" minHeight="none">
        <Stack>
          <div className="page-header compact-header">
            <div>
              <h2 className="section-title">Conversion goals</h2>
            </div>
            <ModuleActionModals
              items={[
                {
                  content: recordEventForm,
                  icon: "activity",
                  id: "event",
                  label: "Event",
                  title: "Record manual event"
                },
                {
                  content: createGoalForm,
                  icon: "goal",
                  id: "goal",
                  label: "Goal",
                  title: "Create conversion goal"
                }
              ]}
              toolbarLabel="Analytics tools"
            />
          </div>
          <Table>
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
                  const progressPercent = Math.min(100, Math.round(progress.count / Math.max(1, goal.targetCount) * 100));

                  return (
                    <tr key={goal.id}>
                    <td>
                      <strong>{goal.name}</strong>
                      <br />
                      <span className="muted-text">{eventDisplayName(goal.eventType, goal.eventName)}</span>
                    </td>
                    <td>
                      {progress.count}/{goal.targetCount}
                      {goal.targetValueCents ? ` - ${formatMoney(progress.valueCents, goal.currency)}` : ""}
                      <span className="ui-progress" aria-hidden="true">
                        <span className={`ui-progress-fill ui-progress-fill-${Math.ceil(progressPercent / 10) * 10}`} />
                      </span>
                    </td>
                    <td>
                      <Badge tone={goal.isActive ? "success" : "danger"}>{goal.isActive ? "active" : "paused"}</Badge>
                    </td>
                    <td>
                      <form action={updateAnalyticsGoalStatusAction}>
                        <input type="hidden" name="id" value={goal.id} />
                        <input type="hidden" name="isActive" value={goal.isActive ? "false" : "true"} />
                        <Button variant="secondary" type="submit">
                          {goal.isActive ? "Pause" : "Activate"}
                        </Button>
                      </form>
                    </td>
                  </tr>);

                })}
              {!goals.length ?
                <tr>
                  <td colSpan={4}>No conversion goals yet.</td>
                </tr> :
                null}
            </tbody>
          </Table>
        </Stack>
        </Card>

        <Card as="section" minHeight="none">
        <Stack>
          <h2 className="section-title">Top events</h2>
          <Table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {topEvents.map((event) =>
                <tr key={event.label}>
                  <td>{event.label}</td>
                  <td>{event.count}</td>
                </tr>
                )}
              {!topEvents.length ?
                <tr>
                  <td colSpan={2}>No events recorded yet.</td>
                </tr> :
                null}
            </tbody>
          </Table>
        </Stack>
        </Card>
      </EqualGrid>

      <EqualGrid as="section">
        <Card as="section" minHeight="none">
        <Stack>
          <h2 className="section-title">Source attribution</h2>
          <Table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Events</th>
              </tr>
            </thead>
            <tbody>
              {topSources.map((source) =>
                <tr key={source.label}>
                  <td>{source.label}</td>
                  <td>{source.count}</td>
                </tr>
                )}
              {!topSources.length ?
                <tr>
                  <td colSpan={2}>No source data yet.</td>
                </tr> :
                null}
            </tbody>
          </Table>
        </Stack>
        </Card>

        <Card as="section" minHeight="none">
        <Stack>
          <h2 className="section-title">Recent events</h2>
          <Table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Source</th>
                <th>Value</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {visibleEvents.map((event) =>
                <tr key={event.id}>
                  <td>
                    <strong>{eventDisplayName(event.eventType, event.eventName)}</strong>
                    <br />
                    <span className="muted-text">{event.pathname || event.relatedType || "No path"}</span>
                  </td>
                  <td>{[event.source, event.medium].filter(Boolean).join(" / ") || "direct / unknown"}</td>
                  <td>{event.valueCents ? formatMoney(event.valueCents, event.currency) : "-"}</td>
                  <td>{formatDateTime(event.occurredAt, settings.timezone)}</td>
                </tr>
                )}
              {!visibleEvents.length ?
                <tr>
                  <td colSpan={4}>No recent events yet.</td>
                </tr> :
                null}
            </tbody>
          </Table>
        </Stack>
        </Card>
      </EqualGrid>
    </div>);

}
