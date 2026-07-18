import { DashboardCardList, DashboardMetric } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { widgetItemLimit } from "@/shell/dashboard-widget-utils";

export const recentMediaWidget = {
  defaultSize: "md",
  description: "Latest uploads, with thumbnails when the widget is large.",
  id: "media.recent",
  moduleId: "media",
  sizes: ["sm", "md", "lg"],
  title: "Recent media",
  async render({ preview, siteId, size }) {
    if (preview) {
      return (
        <>
          <DashboardMetric detail="6 private" label="Media assets" value={84} />
          {size !== "sm" ? (
            <div className="dashboard-card-media-grid dashboard-card-media-grid-sample" aria-label="Sample recent media">
              {["Studio portrait", "Wedding detail", "Family session", "Product image", "Outdoor portrait"].map((label) => (
                <span aria-label={label} key={label} role="img" />
              ))}
            </div>
          ) : null}
        </>
      );
    }

    const limit = widgetItemLimit(size);
    const [count, privateCount, assets] = await Promise.all([
      prisma.mediaAsset.count({ where: { siteId, deletedAt: null } }),
      prisma.mediaAsset.count({ where: { siteId, deletedAt: null, isPrivate: true } }),
      prisma.mediaAsset.findMany({
        include: { variants: { where: { type: "THUMBNAIL" }, take: 1 } },
        orderBy: { createdAt: "desc" },
        take: limit,
        where: { siteId, deletedAt: null }
      })
    ]);

    return (
      <>
        <DashboardMetric detail={`${privateCount} private`} label="Media assets" value={count} />
        {size !== "sm" && assets.length ? (
          <div className="dashboard-card-media-grid">
            {assets.map((asset) => {
              const thumbnailUrl = asset.variants[0]?.url || asset.url;

              return (
                <span
                  aria-label={asset.alt || asset.filename}
                  key={asset.id}
                  role="img"
                  style={{ backgroundImage: `url(${JSON.stringify(thumbnailUrl)})` }}
                />
              );
            })}
          </div>
        ) : size !== "sm" ? (
          <DashboardCardList
            empty="No media has been uploaded yet."
            items={assets.map((asset) => ({
              detail: asset.folder || asset.mimeType || "Media asset",
              id: asset.id,
              title: asset.filename
            }))}
          />
        ) : null}
      </>
    );
  }
} satisfies DashboardWidgetDefinition;
