import { MediaDriver, MediaVariantType, type Prisma } from "@prisma/client";
import { getAccessibleMediaWhere, requireAdmin } from "@/lib/auth";
import { isMediaUploadDriverConfigured, mediaAssetDisplayUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { updateContentAction, updateContentProfileAction } from "./actions";
import { ContentProfileEditor } from "./content-profile-editor";
import { normalizeContentProfiles } from "./content-profiles";
import { HeroContentEditor } from "./hero-content-editor";
import { getHeroPresentationForSite } from "./hero-presentation.server";
import { createContentTestimonialAction, removeContentTestimonialAction, updateContentTestimonialAction } from "./testimonials-actions";
import { getContentTestimonials } from "./testimonials-data";
import { TestimonialsEditor } from "./testimonials-editor";

export const dynamic = "force-dynamic";

type ContentPageProps = {
  searchParams: Promise<{ saved?: string; error?: string; profile?: string }>;
};

export default async function ContentPage({ searchParams }: ContentPageProps) {
  const user = await requireAdmin("content:manage");
  const [{ saved }, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const activeMediaWhere: Prisma.MediaAssetWhereInput = await getAccessibleMediaWhere(user, settings.siteId, {
    deletedAt: null,
    isPrivate: false
  });
  const [heroPresentation, mediaAssets, testimonials, services, servicePackages] = await Promise.all([
    getHeroPresentationForSite(settings.siteId, settings),
    prisma.mediaAsset.findMany({
      where: activeMediaWhere,
      orderBy: { createdAt: "desc" },
      take: 24
    }),
    getContentTestimonials(settings.siteId),
    prisma.service.findMany({
      where: { siteId: settings.siteId, isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { category: true, id: true, name: true }
    }),
    prisma.servicePackage.findMany({
      where: { siteId: settings.siteId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { _count: { select: { items: true } }, id: true, name: true }
    })
  ]);
  const contentProfiles = normalizeContentProfiles(settings.publicContentConfig);
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
          <h1>Homepage content</h1>
          <p>Edit the public hero, then curate the testimonials that appear across your site.</p>
        </div>
      </header>

      {saved ? <div className="success-message">{savedContentMessage(saved)}</div> : null}
      {params.error ? <div className="error">{decodeURIComponent(params.error)}</div> : null}

      <HeroContentEditor
        action={updateContentAction}
        canUploadHeroImage={canUploadHeroImage}
        initialPresentation={heroPresentation}
        mediaAssets={mediaAssetOptions}
        settings={settings}
      />

      <ContentProfileEditor
        action={updateContentProfileAction}
        activeProfile={params.profile}
        packages={servicePackages.map((servicePackage) => ({
          id: servicePackage.id,
          itemCount: servicePackage._count.items,
          name: servicePackage.name
        }))}
        profiles={contentProfiles}
        services={services}
        testimonials={testimonials}
      />

      <TestimonialsEditor
        canUploadImage={canUploadHeroImage}
        createAction={createContentTestimonialAction}
        mediaAssets={mediaAssetOptions}
        removeAction={removeContentTestimonialAction}
        testimonials={testimonials}
        updateAction={updateContentTestimonialAction}
      />
    </div>);

}

function canUploadWithDriver(driver: MediaDriver) {
  return isMediaUploadDriverConfigured(driver);
}

function savedContentMessage(saved: string) {
  if (saved === "testimonial") return "Testimonial published.";
  if (saved === "testimonial-removed") return "Testimonial removed.";
  if (saved === "profile") return "Public homepage profile saved.";
  return "Content saved.";
}
