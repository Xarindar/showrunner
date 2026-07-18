import { DashboardCardList, DashboardMetric } from "@/components/ui";
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
  async render({ siteId, size, timezone }) {
    const limit = widgetItemLimit(size);
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
        {size !== "sm" ? (
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
