import { prisma } from "@/lib/prisma";
import { nativeSchedulingAdapter } from "@/lib/scheduling/native";
import { getSiteSettings } from "@/lib/site";
import { getTodayDateKey, parseZonedDateKey } from "@/lib/timezone";
import { AvailabilityPanel } from "./components/availability-panel";
import { BlockoutsPanel } from "./components/blockouts-panel";
import { ServicesPanel } from "./components/services-panel";
import { SlotDiagnosticsPanel } from "./components/slot-diagnostics-panel";

export const dynamic = "force-dynamic";

type SchedulingPageProps = {
  searchParams: Promise<{ saved?: string; error?: string; diagnosticServiceId?: string; diagnosticDate?: string }>;
};

export default async function SchedulingPage({ searchParams }: SchedulingPageProps) {
  const [params, services, availability, blockouts, settings] = await Promise.all([
    searchParams,
    prisma.service.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.availabilityRule.findMany({ orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }] }),
    prisma.blockedTime.findMany({ orderBy: { startsAt: "asc" }, take: 20 }),
    getSiteSettings()
  ]);
  const selectedServiceId = services.some((service) => service.id === params.diagnosticServiceId)
    ? String(params.diagnosticServiceId)
    : services[0]?.id || "";
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(params.diagnosticDate || "")
    ? String(params.diagnosticDate)
    : getTodayDateKey(settings.timezone);
  const diagnosticDay = parseZonedDateKey(selectedDate, settings.timezone);
  const diagnostics =
    selectedServiceId && diagnosticDay
      ? await nativeSchedulingAdapter.getSlotDiagnostics(selectedServiceId, diagnosticDay)
      : null;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Scheduling</p>
          <h1 style={{ fontSize: "2.4rem" }}>Services, hours, and blockouts</h1>
          <p>Configure how booking works. Day-to-day appointment management now lives in Appointments.</p>
        </div>
      </header>

      {params.saved ? <div className="success-message">Scheduling changes saved.</div> : null}
      {params.error ? (
        <div className="error">{params.error === "blockout" ? "Blockouts must use valid start and end times." : params.error}</div>
      ) : null}

      <ServicesPanel services={services} />
      <SlotDiagnosticsPanel
        diagnostics={diagnostics}
        selectedDate={selectedDate}
        selectedServiceId={selectedServiceId}
        services={services}
      />
      <AvailabilityPanel availability={availability} />
      <BlockoutsPanel blockouts={blockouts} timezone={settings.timezone} />
    </div>
  );
}
