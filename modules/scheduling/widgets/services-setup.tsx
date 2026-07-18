import { Badge, DashboardCardList, DashboardRing } from "@/components/ui";
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
    const limit = size === "lg" ? 2 : widgetItemLimit(size);
    const [activeCount, totalCount, staffCount, resourceCount, services] = await Promise.all([
      prisma.service.count({ where: { siteId, isActive: true } }),
      prisma.service.count({ where: { siteId } }),
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
        <DashboardRing
          detail={`${staffCount} staff · ${resourceCount} resources`}
          label="Services active"
          max={Math.max(1, totalCount)}
          tone={activeCount === totalCount && totalCount > 0 ? "positive" : "neutral"}
          value={activeCount}
        />
        {size === "lg" ? (
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
