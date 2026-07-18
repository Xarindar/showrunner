import { DashboardCardList, DashboardMetric, DashboardSegmentBar } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { widgetItemLimit, widgetShortDateLabel } from "@/shell/dashboard-widget-utils";

export const portfolioProofingWidget = {
  defaultSize: "md",
  description: "Open proofing rounds and published gallery coverage.",
  id: "portfolio.proofing",
  moduleId: "portfolio",
  sizes: ["sm", "md", "lg"],
  title: "Portfolio proofing",
  async render({ preview, siteId, size, timezone }) {
    if (preview) {
      return (
        <>
          <DashboardMetric detail="14 published galleries" label="Open proof rounds" value={3} />
          <DashboardSegmentBar
            items={[
              { label: "Published", tone: "positive", value: 14 },
              { label: "In proofing", tone: "attention", value: 3 }
            ]}
          />
        </>
      );
    }

    const limit = size === "lg" ? 2 : widgetItemLimit(size);
    const [publishedGalleries, openRounds, recentRounds] = await Promise.all([
      prisma.portfolioGallery.count({ where: { siteId, status: "PUBLISHED" } }),
      prisma.portfolioProofRound.count({ where: { siteId, status: { in: ["OPEN", "CHANGES_REQUESTED"] } } }),
      prisma.portfolioProofRound.findMany({
        include: { gallery: true },
        orderBy: { updatedAt: "desc" },
        take: limit,
        where: { siteId, status: { in: ["OPEN", "CHANGES_REQUESTED"] } }
      })
    ]);

    return (
      <>
        <DashboardMetric detail={`${publishedGalleries} published galleries`} label="Open proof rounds" value={openRounds} />
        <DashboardSegmentBar
          items={[
            { label: "Published", tone: "positive", value: publishedGalleries },
            { label: "In proofing", tone: "attention", value: openRounds }
          ]}
        />
        {size === "lg" ? (
          <DashboardCardList
            empty="No proof rounds are open."
            items={recentRounds.map((round) => ({
              detail: round.gallery.title,
              id: round.id,
              meta: widgetShortDateLabel(round.updatedAt, timezone),
              title: round.title || `Round ${round.roundNumber}`
            }))}
          />
        ) : null}
      </>
    );
  }
} satisfies DashboardWidgetDefinition;
