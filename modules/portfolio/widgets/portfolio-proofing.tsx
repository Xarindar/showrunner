import { DashboardCardList, DashboardMetric, DashboardSegmentBar } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { widgetItemLimit, widgetShortDateLabel } from "@/shell/dashboard-widget-utils";

export const portfolioGalleriesWidget = {
  defaultSize: "md",
  description: "Published website galleries and albums in progress.",
  // Keep the stored widget ID so existing dashboard placements continue to work.
  id: "portfolio.proofing",
  moduleId: "portfolio",
  sizes: ["sm", "md", "lg"],
  title: "Portfolio galleries",
  async render({ preview, siteId, size, timezone }) {
    if (preview) return <>
      <DashboardMetric detail="3 draft albums" label="Published galleries" value={14} />
      <DashboardSegmentBar items={[{ label: "Published", tone: "positive", value: 14 }, { label: "Draft", tone: "attention", value: 3 }]} />
    </>;
    const [published, drafts, recentGalleries] = await Promise.all([
      prisma.portfolioGallery.count({ where: { siteId, visibility: "PUBLIC", status: "PUBLISHED" } }),
      prisma.portfolioGallery.count({ where: { siteId, visibility: "PUBLIC", status: "DRAFT" } }),
      size === "lg" ? prisma.portfolioGallery.findMany({
        where: { siteId, visibility: "PUBLIC", status: { in: ["DRAFT", "PUBLISHED"] } },
        orderBy: { updatedAt: "desc" }, take: widgetItemLimit(size),
        select: { id: true, title: true, status: true, updatedAt: true }
      }) : []
    ]);
    return <>
      <DashboardMetric detail={`${drafts} draft albums`} label="Published galleries" value={published} />
      <DashboardSegmentBar items={[{ label: "Published", tone: "positive", value: published }, { label: "Draft", tone: "attention", value: drafts }]} />
      {size === "lg" && <DashboardCardList empty="No website galleries yet." items={recentGalleries.map(gallery => ({
        id: gallery.id, title: gallery.title, detail: gallery.status === "PUBLISHED" ? "Published" : "Draft", meta: widgetShortDateLabel(gallery.updatedAt, timezone)
      }))} />}
    </>;
  }
} satisfies DashboardWidgetDefinition;
