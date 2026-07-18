import { DashboardIdentityList, DashboardMetric } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { widgetItemLimit, widgetShortDateLabel } from "@/shell/dashboard-widget-utils";

export const formSubmissionsWidget = {
  defaultSize: "md",
  description: "New form submissions and active intake surfaces.",
  id: "forms.submissions",
  moduleId: "forms",
  sizes: ["sm", "md", "lg"],
  title: "Form submissions",
  async render({ siteId, size, timezone }) {
    const limit = size === "md" ? 2 : size === "lg" ? 4 : widgetItemLimit(size);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [activeForms, recentCount, submissions] = await Promise.all([
      prisma.form.count({ where: { siteId, status: "ACTIVE" } }),
      prisma.formSubmission.count({ where: { form: { siteId }, createdAt: { gte: sevenDaysAgo } } }),
      prisma.formSubmission.findMany({
        include: { form: true },
        orderBy: { createdAt: "desc" },
        take: limit,
        where: { form: { siteId } }
      })
    ]);

    return (
      <>
        <DashboardMetric detail={`${activeForms} active forms`} label="Submissions this week" value={recentCount} />
        {size !== "sm" ? (
          <DashboardIdentityList
            empty="No form submissions have arrived yet."
            items={submissions.map((submission) => ({
              detail: submission.form.name,
              id: submission.id,
              meta: widgetShortDateLabel(submission.createdAt, timezone),
              title: submission.submitterName || submission.submitterEmail || "Anonymous submission"
            }))}
          />
        ) : null}
      </>
    );
  }
} satisfies DashboardWidgetDefinition;
