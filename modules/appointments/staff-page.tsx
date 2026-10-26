import { notFound } from "next/navigation";
import { getSiteSettings } from "@/lib/site";
import { requireAdmin, hasAdminPermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Notification } from "@/components/ui/notifications";
import { StaffPanel } from "@/modules/scheduling/components/staff-panel";
import styles from "./schedule.module.css";

export default async function StaffPage({ searchParams }: { searchParams?: Promise<Record<string, string | undefined>> }) {
  const user = await requireAdmin("scheduling:manage");
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("appointments")) notFound();
  const params = await searchParams || {};
  const canLinkStaffAccounts = hasAdminPermission(user, "users:manage");
  const [staff, availability, assignments, adminUsers] = await Promise.all([
    prisma.staffMember.findMany({ where: { siteId: settings.siteId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    prisma.availabilityRule.findMany({ where: { siteId: settings.siteId, staffId: { not: null } }, include: { resource: true, staff: true }, orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }] }),
    prisma.service.findMany({ where: { siteId: settings.siteId }, select: { staffAssignments: { select: { staffId: true } } } }),
    canLinkStaffAccounts ? prisma.adminUser.findMany({ where: { tenantId: user.tenantId }, select: { id: true, email: true, role: true }, orderBy: { email: "asc" } }) : Promise.resolve([])
  ]);
  return <div className={styles.page}>
    <h1>Staff</h1>
    {params.saved && <Notification tone="success" queryKey="saved">Staff updated.</Notification>}
    {params.error && <Notification tone="danger" queryKey="error">{params.error}</Notification>}
    <StaffPanel staff={staff} availability={availability} timezone={settings.timezone} adminUsers={adminUsers} canLinkStaffAccounts={canLinkStaffAccounts}
      assignedStaffIds={new Set(assignments.flatMap(service => service.staffAssignments.map(assignment => assignment.staffId)))}
      staffIdsWithAvailability={new Set(availability.flatMap(rule => rule.staffId ? [rule.staffId] : []))} />
  </div>;
}
