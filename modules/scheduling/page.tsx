import { prisma } from "@/lib/prisma";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { requireAdmin } from "@/lib/auth";
import { absoluteCalendarUrl, icsCalendarAdapter, requestBaseUrl } from "@/lib/scheduling/calendar";
import { getGoogleCalendarConnections } from "@/lib/scheduling/google-calendar";
import { nativeSchedulingAdapter } from "@/lib/scheduling/native";
import { getSiteSettings } from "@/lib/site";
import { getTodayDateKey, parseZonedDateKey } from "@/lib/timezone";
import { AvailabilityPanel } from "./components/availability-panel";
import { BlockoutsPanel } from "./components/blockouts-panel";
import { CalendarFeedsPanel } from "./components/calendar-feeds-panel";
import { RemindersPanel } from "./components/reminders-panel";
import { ResourcesPanel } from "./components/resources-panel";
import { ServicesPanel } from "./components/services-panel";
import { SlotDiagnosticsPanel } from "./components/slot-diagnostics-panel";
import { StaffPanel } from "./components/staff-panel";

export const dynamic = "force-dynamic";

type SchedulingPageProps = {
  searchParams: Promise<{
    saved?: string;
    error?: string;
    diagnosticServiceId?: string;
    diagnosticStaffId?: string;
    diagnosticResourceId?: string;
    diagnosticDate?: string;
  }>;
};

export default async function SchedulingPage({ searchParams }: SchedulingPageProps) {
  const adminUser = await requireAdmin("scheduling:manage");
  const canLinkStaffAccounts = hasAdminPermission(adminUser, "users:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const baseUrl = await requestBaseUrl();
  const [services, staff, resources, availability, blockouts, schedulingSettings, googleCalendarConnections, adminUsers] = await Promise.all([
    prisma.service.findMany({
      where: { siteId: settings.siteId },
      include: {
        resourceAssignments: { include: { resource: true }, orderBy: { resource: { name: "asc" } } },
        staffAssignments: { include: { staff: true }, orderBy: { staff: { name: "asc" } } }
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.staffMember.findMany({ where: { siteId: settings.siteId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    prisma.resource.findMany({ where: { siteId: settings.siteId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    prisma.availabilityRule.findMany({
      where: { siteId: settings.siteId },
      include: { resource: true, staff: true },
      orderBy: [{ staffId: "asc" }, { resourceId: "asc" }, { weekday: "asc" }, { startMinutes: "asc" }]
    }),
    prisma.blockedTime.findMany({ where: { siteId: settings.siteId }, include: { resource: true }, orderBy: { startsAt: "asc" }, take: 20 }),
    prisma.schedulingSettings.findUnique({ where: { siteId: settings.siteId } }),
    getGoogleCalendarConnections(settings.siteId),
    canLinkStaffAccounts
      ? prisma.adminUser.findMany({ select: { id: true, email: true, role: true }, orderBy: { email: "asc" } })
      : Promise.resolve([])
  ]);
  const staffIdsWithAvailability = new Set(
    availability.flatMap((rule) => (rule.staffId ? [rule.staffId] : []))
  );
  const assignedStaffIds = new Set(
    services.flatMap((service) => service.staffAssignments.map((assignment) => assignment.staffId))
  );
  const resourceIdsWithAvailability = new Set(
    availability.flatMap((rule) => (rule.resourceId ? [rule.resourceId] : []))
  );
  const assignedResourceIds = new Set(
    services.flatMap((service) => service.resourceAssignments.map((assignment) => assignment.resourceId))
  );
  const selectedServiceId = services.some((service) => service.id === params.diagnosticServiceId)
    ? String(params.diagnosticServiceId)
    : services[0]?.id || "";
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(params.diagnosticDate || "")
    ? String(params.diagnosticDate)
    : getTodayDateKey(settings.timezone);
  const selectedStaffId = staff.some((member) => member.id === params.diagnosticStaffId) ? String(params.diagnosticStaffId) : "";
  const selectedResourceId = resources.some((resource) => resource.id === params.diagnosticResourceId) ? String(params.diagnosticResourceId) : "";
  const diagnosticDay = parseZonedDateKey(selectedDate, settings.timezone);
  const diagnostics =
    selectedServiceId && diagnosticDay
      ? await nativeSchedulingAdapter.getSlotDiagnostics(selectedServiceId, diagnosticDay, {
          resourceId: selectedResourceId || undefined,
          staffId: selectedStaffId || undefined
        })
      : null;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Scheduling</p>
          <h1>Services, hours, and blockouts</h1>
          <p>Configure how booking works. Day-to-day appointment management now lives in Appointments.</p>
        </div>
      </header>

      {params.saved ? <div className="success-message">Scheduling changes saved.</div> : null}
      {params.error ? (
        <div className="error">{params.error === "blockout" ? "Blockouts must use valid start and end times." : params.error}</div>
      ) : null}

      <StaffPanel
        staff={staff}
        assignedStaffIds={assignedStaffIds}
        staffIdsWithAvailability={staffIdsWithAvailability}
        adminUsers={adminUsers}
        canLinkStaffAccounts={canLinkStaffAccounts}
      />
      <RemindersPanel
        enabled={schedulingSettings?.bookingReminderEnabled ?? true}
        leadMinutes={schedulingSettings?.bookingReminderLeadMinutes ?? 1440}
      />
      <CalendarFeedsPanel
        siteFeedUrl={absoluteCalendarUrl(baseUrl, icsCalendarAdapter.feedPath({ siteId: settings.siteId }))}
        staffFeedUrls={staff.map((member) => ({
          staff: member,
          url: absoluteCalendarUrl(baseUrl, icsCalendarAdapter.feedPath({ siteId: settings.siteId, staffId: member.id }))
        }))}
        googleConnections={googleCalendarConnections.map((connection) => ({
          connection,
          staff: staff.find((member) => member.id === connection.ownerId) || null
        }))}
        staff={staff}
      />
      <ResourcesPanel resources={resources} assignedResourceIds={assignedResourceIds} resourceIdsWithAvailability={resourceIdsWithAvailability} />
      <ServicesPanel resources={resources} services={services} staff={staff} />
      <SlotDiagnosticsPanel
        diagnostics={diagnostics}
        resources={resources}
        selectedDate={selectedDate}
        selectedResourceId={selectedResourceId}
        selectedServiceId={selectedServiceId}
        selectedStaffId={selectedStaffId}
        services={services}
        staff={staff}
      />
      <AvailabilityPanel availability={availability} resources={resources} staff={staff} />
      <BlockoutsPanel blockouts={blockouts} resources={resources} timezone={settings.timezone} />
    </div>
  );
}
