import { DashboardIdentityList, DashboardMetric, DashboardSegmentBar } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { widgetItemLimit } from "@/shell/dashboard-widget-utils";

export const testimonialInboxWidget = {
  defaultSize: "md",
  description: "Testimonials waiting for review.",
  id: "testimonials.inbox",
  moduleId: "testimonials",
  sizes: ["sm", "md", "lg"],
  title: "Testimonial inbox",
  async render({ siteId, size }) {
    const limit = size === "lg" ? 2 : widgetItemLimit(size);
    const [pendingCount, approvedCount, testimonials] = await Promise.all([
      prisma.testimonial.count({ where: { siteId, status: "PENDING" } }),
      prisma.testimonial.count({ where: { siteId, status: "APPROVED" } }),
      prisma.testimonial.findMany({
        orderBy: { submittedAt: "desc" },
        take: limit,
        where: { siteId, status: "PENDING" }
      })
    ]);

    return (
      <>
        <DashboardMetric detail={`${approvedCount} approved`} label="Pending testimonials" value={pendingCount} />
        <DashboardSegmentBar
          items={[
            { label: "Waiting", tone: "attention", value: pendingCount },
            { label: "Approved", tone: "positive", value: approvedCount }
          ]}
        />
        {size === "lg" ? (
          <DashboardIdentityList
            empty="No testimonials are waiting for approval."
            items={testimonials.map((testimonial) => ({
              detail: testimonial.quote,
              id: testimonial.id,
              meta: `${testimonial.rating}/5`,
              title: testimonial.authorName
            }))}
          />
        ) : null}
      </>
    );
  }
} satisfies DashboardWidgetDefinition;
