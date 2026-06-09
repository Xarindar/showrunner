import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { csvDocument } from "@/lib/api/csv";

export async function GET() {
  await requireAdmin();

  const events = await prisma.analyticsEvent.findMany({
    orderBy: { occurredAt: "desc" },
    take: 10000
  });

  const header = [
    "occurredAt",
    "eventType",
    "eventName",
    "source",
    "medium",
    "campaign",
    "landingPage",
    "referrer",
    "pathname",
    "sessionId",
    "visitorId",
    "clientEmail",
    "relatedType",
    "relatedId",
    "valueCents",
    "currency",
    "metadata"
  ];
  const rows = events.map((event) => [
    event.occurredAt.toISOString(),
    event.eventType,
    event.eventName,
    event.source,
    event.medium,
    event.campaign,
    event.landingPage,
    event.referrer,
    event.pathname,
    event.sessionId,
    event.visitorId,
    event.clientEmail,
    event.relatedType,
    event.relatedId,
    event.valueCents,
    event.currency,
    JSON.stringify(event.metadata)
  ]);
  const csv = csvDocument([header, ...rows], { lineEnding: "\n" });

  return new Response(csv, {
    headers: {
      "content-disposition": `attachment; filename="analytics-events-${new Date().toISOString().slice(0, 10)}.csv"`,
      "content-type": "text/csv; charset=utf-8"
    }
  });
}
