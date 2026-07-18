import { DashboardCardList, DashboardMetric, DashboardSegmentBar } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { widgetItemLimit, widgetShortDateLabel } from "@/shell/dashboard-widget-utils";

export const automationQueueWidget = {
  defaultSize: "md",
  description: "Automation health, open tasks, and recent runs.",
  id: "automation.queue",
  moduleId: "automation",
  sizes: ["sm", "md", "lg"],
  title: "Automation queue",
  async render({ preview, siteId, size, timezone }) {
    if (preview) {
      return (
        <>
          <DashboardMetric detail="5 open tasks, 1 failed run" label="Active automations" value={8} />
          <DashboardSegmentBar
            items={[
              { label: "Active", tone: "positive", value: 8 },
              { label: "Open tasks", tone: "attention", value: 5 },
              { label: "Failed", tone: "danger", value: 1 }
            ]}
          />
        </>
      );
    }

    const limit = size === "lg" ? 2 : widgetItemLimit(size);
    const [activeAutomations, openTasks, failedRuns, runs] = await Promise.all([
      prisma.automation.count({ where: { siteId, status: "ACTIVE" } }),
      prisma.automationTask.count({ where: { siteId, status: "OPEN" } }),
      prisma.automationRun.count({ where: { automation: { siteId }, status: "FAILED" } }),
      prisma.automationRun.findMany({
        include: { automation: true },
        orderBy: { createdAt: "desc" },
        take: limit,
        where: { automation: { siteId } }
      })
    ]);

    return (
      <>
        <DashboardMetric detail={`${openTasks} open tasks, ${failedRuns} failed runs`} label="Active automations" value={activeAutomations} />
        <DashboardSegmentBar
          items={[
            { label: "Active", tone: "positive", value: activeAutomations },
            { label: "Open tasks", tone: "attention", value: openTasks },
            { label: "Failed", tone: "danger", value: failedRuns }
          ]}
        />
        {size === "lg" ? (
          <DashboardCardList
            empty="No automation runs have happened yet."
            items={runs.map((run) => ({
              detail: run.summary || run.triggerKey || run.automation.action.toLowerCase(),
              id: run.id,
              meta: widgetShortDateLabel(run.createdAt, timezone),
              title: run.automation.name
            }))}
          />
        ) : null}
      </>
    );
  }
} satisfies DashboardWidgetDefinition;
