import { Badge, DashboardCardList, DashboardMetric } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { widgetItemLimit } from "@/shell/dashboard-widget-utils";

export const servicesSetupWidget = {
  defaultSize: "md",
  description: "Active services, staff, and resource coverage.",
  id: "scheduling.services",
  moduleId: "scheduling",
  sizes: ["sm", "md", "lg"],
  title: "Services setup",
  async render({ siteId, size }) {
    const limit = widgetItemLimit(size);
    const [activeCount, staffCount, resourceCount, services] = await Promise.all([
      prisma.service.count({ where: { siteId, isActive: true } }),
      prisma.staffMember.count({ where: { siteId, isActive: true } }),
      prisma.resource.count({ where: { siteId, isActive: true } }),
      prisma.service.findMany({
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        take: limit,
        where: { siteId }
      })
    ]);

    return (
      <>
        <DashboardMetric detail={`${staffCount} staff, ${resourceCount} resources`} label="Active services" value={activeCount} />
        {size !== "sm" ? (
          <DashboardCardList
            empty="No services are configured yet."
            items={services.map((service) => ({
              detail: `${service.durationMinutes} min${service.requestOnly ? " request-only" : ""}`,
              id: service.id,
              meta: service.isActive ? <Badge>active</Badge> : <Badge>draft</Badge>,
              title: service.name
            }))}
          />
        ) : null}
      </>
    );
  }
} satisfies DashboardWidgetDefinition;
