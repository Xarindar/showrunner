import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { HourlyRates } from "@/modules/scheduling/components/hourly-rates";

export default async function RatesPage() {
  await requireAdmin("scheduling:manage");
  const { siteId } = await getSiteSettings();
  const rates = await prisma.hourlyRate.findMany({ where: { siteId }, orderBy: { name: "asc" }, select: { id: true, name: true, amountCents: true } });
  return <HourlyRates initialRates={rates} />;
}
