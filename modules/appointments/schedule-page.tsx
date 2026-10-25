import { notFound } from "next/navigation";
import { getSiteSettings } from "@/lib/site";
import { requireAdmin, hasAdminPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { absoluteCalendarUrl, icsCalendarAdapter, requestBaseUrl } from "@/lib/scheduling/calendar";
import { getGoogleCalendarConnections } from "@/lib/scheduling/google-calendar";
import { nativeSchedulingAdapter } from "@/lib/scheduling/native";
import { getTodayDateKey, parseZonedDateKey } from "@/lib/timezone";
import { Notification } from "@/components/ui/notifications";
import styles from "./schedule.module.css";
import { AvailabilityPanel } from "@/modules/scheduling/components/availability-panel";
import { BlockoutsPanel } from "@/modules/scheduling/components/blockouts-panel";
import { CalendarFeedsPanel } from "@/modules/scheduling/components/calendar-feeds-panel";
import { RemindersPanel } from "@/modules/scheduling/components/reminders-panel";
import { ResourcesPanel } from "@/modules/scheduling/components/resources-panel";
import { SlotDiagnosticsPanel } from "@/modules/scheduling/components/slot-diagnostics-panel";
import { StaffPanel } from "@/modules/scheduling/components/staff-panel";

export default async function SchedulePage({ searchParams }: { searchParams?: Promise<Record<string, string | undefined>> }) {
  const user = await requireAdmin("scheduling:manage");
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("appointments")) notFound();
  const params = await searchParams || {};
  const canLinkStaffAccounts = hasAdminPermission(user, "users:manage");
  const baseUrl = await requestBaseUrl();
  const [staff, resources, services, availability, blockouts, schedulingSettings, googleCalendarConnections, adminUsers] = await Promise.all([
  prisma.staffMember.findMany({ where: { siteId: settings.siteId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
  prisma.resource.findMany({ where: { siteId: settings.siteId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
  prisma.service.findMany({
    where: { siteId: settings.siteId },
    select: {
      id: true, name: true, isActive: true,
      resourceAssignments: { include: { resource: true }, orderBy: { resource: { name: "asc" } } },
      staffAssignments: { include: { staff: true }, orderBy: { staff: { name: "asc" } } }
    },
    orderBy: [{ isActive: "desc" }, { category: "asc" }, { name: "asc" }]
  }),
  prisma.availabilityRule.findMany({
    where: { siteId: settings.siteId },
    include: { resource: true, staff: true },
    orderBy: [{ staffId: "asc" }, { resourceId: "asc" }, { weekday: "asc" }, { startMinutes: "asc" }]
  }),
  prisma.blockedTime.findMany({ where: { siteId: settings.siteId, endsAt: { gte: new Date() } }, include: { resource: true }, orderBy: { startsAt: "asc" }, take: 20 }),
  prisma.schedulingSettings.findUnique({ where: { siteId: settings.siteId } }),
  getGoogleCalendarConnections(settings.siteId),
  canLinkStaffAccounts
    ? prisma.adminUser.findMany({
        where: { tenantId: user.tenantId },
        select: { id: true, email: true, role: true },
        orderBy: { email: "asc" }
      })
    : Promise.resolve([])]
  );
  const selectedDiagnosticServiceId = services.some((service) => service.id === params.diagnosticServiceId)
    ? String(params.diagnosticServiceId)
    : services[0]?.id || "";
  const selectedDiagnosticDate = /^\d{4}-\d{2}-\d{2}$/.test(params.diagnosticDate || "")
    ? String(params.diagnosticDate)
    : getTodayDateKey(settings.timezone);
  const selectedDiagnosticStaffId = staff.some((member) => member.id === params.diagnosticStaffId) ? String(params.diagnosticStaffId) : "";
  const selectedDiagnosticResourceId = resources.some((resource) => resource.id === params.diagnosticResourceId) ? String(params.diagnosticResourceId) : "";
  const diagnosticDay = parseZonedDateKey(selectedDiagnosticDate, settings.timezone);
  const diagnostics =
    params.diagnosticServiceId && selectedDiagnosticServiceId && diagnosticDay
      ? await nativeSchedulingAdapter.getSlotDiagnostics(selectedDiagnosticServiceId, diagnosticDay, {
          resourceId: selectedDiagnosticResourceId || undefined,
          staffId: selectedDiagnosticStaffId || undefined
        })
      : null;
  const staffIdsWithAvailability = new Set(availability.flatMap((rule) => (rule.staffId ? [rule.staffId] : [])));
  const assignedStaffIds = new Set(services.flatMap((service) => service.staffAssignments.map((assignment) => assignment.staffId)));
  const resourceIdsWithAvailability = new Set(availability.flatMap((rule) => (rule.resourceId ? [rule.resourceId] : [])));
  const assignedResourceIds = new Set(services.flatMap((service) => service.resourceAssignments.map((assignment) => assignment.resourceId)));

  return <div className={styles.page}>
    <h1>Schedule</h1>
    {params.saved && <Notification tone="success" queryKey="saved">Schedule updated.</Notification>}
    {params.error && <Notification tone="danger" queryKey="error">{params.error}</Notification>}
    <AvailabilityPanel availability={availability} resources={resources} staff={staff} timezone={settings.timezone} />
    <BlockoutsPanel blockouts={blockouts} resources={resources} timezone={settings.timezone} />
    <section aria-label="Schedule settings" className={styles.settings}>
      <details open={params.tab === "team"}>
        <summary>Staff & resources <span>{staff.length} staff · {resources.length} resources</span></summary>
        <div className={styles.section}>
          <StaffPanel adminUsers={adminUsers} assignedStaffIds={assignedStaffIds} canLinkStaffAccounts={canLinkStaffAccounts} staff={staff} staffIdsWithAvailability={staffIdsWithAvailability} />
          <ResourcesPanel resources={resources} assignedResourceIds={assignedResourceIds} resourceIdsWithAvailability={resourceIdsWithAvailability} />
        </div>
      </details>
      <details open={params.tab === "calendar"}>
        <summary>Calendar connections <span>Google Calendar & calendar feeds</span></summary>
        <div className={styles.section}><CalendarFeedsPanel
          googleConnections={googleCalendarConnections.map(connection => ({ connection, staff: staff.find(member => member.id === connection.ownerId) || null }))}
          siteFeedUrl={absoluteCalendarUrl(baseUrl, icsCalendarAdapter.feedPath({ siteId: settings.siteId }))}
          staff={staff} staffFeedUrls={staff.map(member => ({ staff: member, url: absoluteCalendarUrl(baseUrl, icsCalendarAdapter.feedPath({ siteId: settings.siteId, staffId: member.id })) }))}
        /></div>
      </details>
      <details open={params.saved === "reminders" || Boolean(params.error && params.tab === "calendar")}>
        <summary>Reminders <span>{(schedulingSettings?.bookingReminderEnabled ?? true) ? "On" : "Off"}</span></summary>
        <div className={styles.section}><RemindersPanel enabled={schedulingSettings?.bookingReminderEnabled ?? true} leadMinutes={schedulingSettings?.bookingReminderLeadMinutes ?? 1440} /></div>
      </details>
    </section>
    <SlotDiagnosticsPanel defaultOpen={Boolean(params.diagnosticServiceId)} diagnostics={diagnostics} resources={resources}
      selectedDate={selectedDiagnosticDate} selectedResourceId={selectedDiagnosticResourceId} selectedServiceId={selectedDiagnosticServiceId}
      selectedStaffId={selectedDiagnosticStaffId} services={services} staff={staff} />
  </div>;
}
