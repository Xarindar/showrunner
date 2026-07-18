import { DashboardCardList, DashboardMetric, DashboardSegmentBar } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { widgetItemLimit, widgetShortDateLabel } from "@/shell/dashboard-widget-utils";

export const communicationsOutboxWidget = {
  defaultSize: "md",
  description: "Queued, failed, and recent outbound email.",
  id: "communications.outbox",
  moduleId: "communications",
  sizes: ["sm", "md", "lg"],
  title: "Communications outbox",
  async render({ preview, siteId, size, timezone }) {
    if (preview) {
      return (
        <>
          <DashboardMetric detail="1 failed, 186 sent total" label="Queued messages" value={4} />
          <DashboardSegmentBar
            items={[
              { label: "Sent", tone: "positive", value: 186 },
              { label: "Queued", tone: "attention", value: 4 },
              { label: "Failed", tone: "danger", value: 1 }
            ]}
          />
        </>
      );
    }

    const limit = size === "lg" ? 2 : widgetItemLimit(size);
    const [queuedCount, failedCount, sentCount, outbox] = await Promise.all([
      prisma.emailOutbox.count({ where: { siteId, status: "QUEUED" } }),
      prisma.emailOutbox.count({ where: { siteId, status: "FAILED" } }),
      prisma.emailOutbox.count({ where: { siteId, status: "SENT" } }),
      prisma.emailOutbox.findMany({
        orderBy: { updatedAt: "desc" },
        take: limit,
        where: { siteId }
      })
    ]);

    return (
      <>
        <DashboardMetric detail={`${failedCount} failed, ${sentCount} sent total`} label="Queued messages" value={queuedCount} />
        <DashboardSegmentBar
          items={[
            { label: "Sent", tone: "positive", value: sentCount },
            { label: "Queued", tone: "attention", value: queuedCount },
            { label: "Failed", tone: "danger", value: failedCount }
          ]}
        />
        {size === "lg" ? (
          <DashboardCardList
            empty="No email outbox activity yet."
            items={outbox.map((message) => ({
              detail: message.recipientEmail,
              id: message.id,
              meta: widgetShortDateLabel(message.updatedAt, timezone),
              title: message.subject || message.templateKey || message.purpose
            }))}
          />
        ) : null}
      </>
    );
  }
} satisfies DashboardWidgetDefinition;
