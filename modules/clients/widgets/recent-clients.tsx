import { DashboardCardList, DashboardMetric } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { widgetItemLimit, widgetShortDateLabel } from "@/shell/dashboard-widget-utils";

export const recentClientsWidget = {
  defaultSize: "md",
  description: "Recent client records and the size of the CRM.",
  id: "clients.recent",
  moduleId: "clients",
  sizes: ["sm", "md", "lg"],
  title: "Recent clients",
  async render({ siteId, size, timezone }) {
    const limit = widgetItemLimit(size);
    const [count, activeCount, recentClients] = await Promise.all([
      prisma.client.count({ where: { siteId } }),
      prisma.client.count({ where: { siteId, status: "active" } }),
      prisma.client.findMany({
        orderBy: { updatedAt: "desc" },
        take: limit,
        where: { siteId }
      })
    ]);

    return (
      <>
        <DashboardMetric detail={`${activeCount} active`} label="Client records" value={count} />
        {size !== "sm" ? (
          <DashboardCardList
            empty="No clients have been added yet."
            items={recentClients.map((client) => ({
              detail: client.email,
              href: `/admin/clients/${client.id}`,
              id: client.id,
              meta: widgetShortDateLabel(client.updatedAt, timezone),
              title: client.name
            }))}
          />
        ) : null}
      </>
    );
  }
} satisfies DashboardWidgetDefinition;
