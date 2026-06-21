import { MediaDriver, MediaVariantType, type Prisma } from "@prisma/client";
import { getAccessibleMediaWhere, requireAdmin } from "@/lib/auth";
import { isCloudflareImagesConfigured, isR2Configured, mediaAssetDisplayUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { updateContentAction } from "./actions";
import { HeroContentEditor } from "./hero-content-editor";
import { getHeroPresentationForSite } from "./hero-presentation.server";

export const dynamic = "force-dynamic";

type ContentPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function ContentPage({ searchParams }: ContentPageProps) {
  const user = await requireAdmin("content:manage");
  const [{ saved }, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const activeMediaWhere: Prisma.MediaAssetWhereInput = await getAccessibleMediaWhere(user, settings.siteId, {
    deletedAt: null,
    isPrivate: false
  });
  const [heroPresentation, mediaAssets] = await Promise.all([
    getHeroPresentationForSite(settings.siteId, settings),
    prisma.mediaAsset.findMany({
      where: activeMediaWhere,
      orderBy: { createdAt: "desc" },
      take: 24
    })
  ]);
  const mediaAssetOptions = [
    {
      alt: "Neutral admin template hero",
      filename: "hero.svg",
      id: "repo-hero-svg",
      thumbnailUrl: "/hero.svg",
      url: "/hero.svg"
    },
    ...mediaAssets.map((asset) => ({
      alt: asset.isDecorative ? "" : asset.alt || asset.filename,
      filename: asset.filename,
      id: asset.id,
      thumbnailUrl: mediaAssetDisplayUrl(asset, MediaVariantType.CARD),
      url: mediaAssetDisplayUrl(asset, MediaVariantType.HERO)
    }))
  ];
  const canUploadHeroImage = canUploadWithDriver(settings.mediaDriver);
  const params = await searchParams;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Content</p>
          <h1>Homepage hero</h1>
          <p>Edit the public header image, title, caption, call to action, and intro copy.</p>
        </div>
      </header>

      {saved ? <div className="success-message">Content saved.</div> : null}
      {params.error ? <div className="error">{decodeURIComponent(params.error)}</div> : null}

      <HeroContentEditor
        action={updateContentAction}
        canUploadHeroImage={canUploadHeroImage}
        initialPresentation={heroPresentation}
        mediaAssets={mediaAssetOptions}
        settings={settings}
      />
    </div>);

}

function canUploadWithDriver(driver: MediaDriver) {
  if (driver === MediaDriver.R2) return isR2Configured();
  if (driver === MediaDriver.CLOUDFLARE_IMAGES) return isCloudflareImagesConfigured();
  return false;
}
