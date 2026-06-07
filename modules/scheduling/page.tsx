import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { AvailabilityPanel } from "./components/availability-panel";
import { BlockoutsPanel } from "./components/blockouts-panel";
import { ServicesPanel } from "./components/services-panel";

export const dynamic = "force-dynamic";

type SchedulingPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function SchedulingPage({ searchParams }: SchedulingPageProps) {
  const [{ saved, error }, services, availability, blockouts, settings] = await Promise.all([
    searchParams,
    prisma.service.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.availabilityRule.findMany({ orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }] }),
    prisma.blockedTime.findMany({ orderBy: { startsAt: "asc" }, take: 20 }),
    getSiteSettings()
  ]);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Scheduling</p>
          <h1 style={{ fontSize: "2.4rem" }}>Services, hours, and blockouts</h1>
          <p>Configure how booking works. Day-to-day appointment management now lives in Appointments.</p>
        </div>
      </header>

      {saved ? <div className="success-message">Scheduling changes saved.</div> : null}
      {error ? <div className="error">{error === "blockout" ? "Blockouts must use valid start and end times." : error}</div> : null}

      <ServicesPanel services={services} />
      <AvailabilityPanel availability={availability} />
      <BlockoutsPanel blockouts={blockouts} timezone={settings.timezone} />
    </div>
  );
}
