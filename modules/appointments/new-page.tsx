import { requireAdmin, getAccessibleClientWhere, resolveDataScopeMode, getOwnerStaffIds } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { SessionForm } from "./session-form";
import { priceSessionOffering, readSessionOffering } from "@/lib/scheduling/session-offering";
import { servicePriceCents } from "@/lib/scheduling/pricing";

export default async function NewSessionPage() {
  const user = await requireAdmin("appointments:manage");
  const settings = await getSiteSettings();
  const staffIds = await resolveDataScopeMode(user, settings.siteId, "appointments") === "ALL" ? undefined : await getOwnerStaffIds(user, settings.siteId);
  const [services, clients, staff, rates] = await Promise.all([
    prisma.service.findMany({ where: { siteId: settings.siteId, isActive: true, isOneOff: false }, orderBy: { name: "asc" }, select: { id: true, name: true, durationMinutes: true, priceCents: true, pricingType: true, hourlyRate: { select: { id: true, name: true, amountCents: true } }, sessionOffering: true, staffAssignments: { select: { staffId: true } } } }),
    prisma.client.findMany({ where: await getAccessibleClientWhere(user, settings.siteId), orderBy: { name: "asc" }, select: { id: true, name: true, email: true, phone: true } }),
    prisma.staffMember.findMany({ where: { siteId: settings.siteId, isActive: true, ...(staffIds ? { id: { in: staffIds } } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.hourlyRate.findMany({ where: { siteId: settings.siteId }, select: { id: true, name: true, amountCents: true } })
  ]);
  return <SessionForm rates={rates} services={services.map(service => {
    const offering = readSessionOffering(service.sessionOffering);
    return { ...service, priceCents: servicePriceCents(service), sessionOffering: offering ? priceSessionOffering(offering, rates, { pricingType: service.pricingType, hourlyRateId: service.hourlyRate?.id ?? "" }) : null };
  })} clients={clients} staff={staff} timezone={settings.timezone} />;
}
