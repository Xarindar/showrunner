import Link from "next/link";
import { MediaDriver, MediaVariantType, type Prisma } from "@prisma/client";
import { getAccessibleMediaWhere, requireAdmin } from "@/lib/auth";
import { isMediaUploadDriverConfigured, mediaAssetDisplayUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { updateContentAction, updateFeaturedCardAction, updateProfileTestimonialsAction } from "./actions";
import {
  contentProfileLabels,
  getHeroPresentationForProfilePayload,
  normalizeContentProfileKey,
  normalizeContentProfiles,
  type ContentProfileKey
} from "./content-profiles";
import { FeaturedCardEditor } from "./featured-card-editor";
import { HeroContentEditor } from "./hero-content-editor";
import { createContentTestimonialAction, removeContentTestimonialAction, updateContentTestimonialAction } from "./testimonials-actions";
import { getContentTestimonials } from "./testimonials-data";
import { TestimonialsEditor } from "./testimonials-editor";

export const dynamic = "force-dynamic";

type ContentPageProps = {
  searchParams: Promise<{ saved?: string; error?: string; profile?: string }>;
};

export default async function ContentPage({ searchParams }: ContentPageProps) {
  const user = await requireAdmin("content:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const profileKey = normalizeContentProfileKey(params.profile);
  const contentProfiles = normalizeContentProfiles(settings.publicContentConfig);
  const profile = contentProfiles[profileKey];
  const activeMediaWhere: Prisma.MediaAssetWhereInput = await getAccessibleMediaWhere(user, settings.siteId, {
    deletedAt: null,
    isPrivate: false
  });
  const [heroPresentation, mediaAssets, testimonials, services, servicePackages, categories] = await Promise.all([
    getHeroPresentationForProfilePayload(settings.siteId, profileKey, settings),
    prisma.mediaAsset.findMany({
      where: activeMediaWhere,
      orderBy: { createdAt: "desc" },
      take: 24
    }),
    getContentTestimonials(settings.siteId),
    prisma.service.findMany({
      where: { siteId: settings.siteId, isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { mediaAsset: true }
    }),
    prisma.servicePackage.findMany({
      where: { siteId: settings.siteId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        items: {
          include: { service: { include: { mediaAsset: true } } },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
        }
      }
    }),
    prisma.serviceCategory.findMany({
      where: { siteId: settings.siteId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { mediaAsset: true }
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
  const canUpload = canUploadWithDriver(settings.mediaDriver);

  return (
    <div className="stack content-studio">
      <header className="page-header content-studio-header">
        <div>
          <h1>Content</h1>
        </div>
      </header>

      <div className="content-studio-profile-bar">
        <VenueTabs active={profileKey} />
      </div>

      {params.saved ? <div className="success-message">{savedContentMessage(params.saved, profile.label)}</div> : null}
      {params.error ? <div className="error">{decodeURIComponent(params.error)}</div> : null}

      <HeroContentEditor
        action={updateContentAction}
        canUploadHeroImage={canUpload}
        initialPresentation={heroPresentation}
        key={`hero-${profileKey}`}
        mediaAssets={mediaAssetOptions}
        profileKey={profileKey}
        settings={{ heroHeadline: profile.header.headline, heroSubheadline: profile.header.copy }}
      />

      <FeaturedCardEditor
        action={updateFeaturedCardAction}
        canUploadImage={canUpload}
        categories={categories.map((category) => ({
          description: category.description || "",
          imageUrl: adminImageUrl(category.imageUrl, category.mediaAsset),
          name: category.name,
          slug: category.slug
        }))}
        featured={profile.featured}
        key={`featured-${profileKey}`}
        mediaAssets={mediaAssetOptions}
        packages={servicePackages.map((servicePackage) => {
          const firstService = servicePackage.items.map((item) => item.service).find((service) => service.isActive) || null;
          return {
            description: servicePackage.description || "",
            id: servicePackage.id,
            imageUrl: firstService ? adminImageUrl(firstService.imageUrl, firstService.mediaAsset) : "",
            itemCount: servicePackage.items.length,
            name: servicePackage.name
          };
        })}
        profileKey={profileKey}
        services={services.map((service) => ({
          category: service.category || "",
          description: service.description || "",
          id: service.id,
          imageUrl: adminImageUrl(service.imageUrl, service.mediaAsset),
          name: service.name
        }))}
        venueLabel={profile.label}
      />

      <TestimonialsEditor
        assignedIds={profile.testimonialIds}
        canUploadImage={canUpload}
        createAction={createContentTestimonialAction}
        curationAction={updateProfileTestimonialsAction}
        heading={profile.testimonialHeading}
        intro={profile.testimonialIntro}
        key={`testimonials-${profileKey}`}
        mediaAssets={mediaAssetOptions}
        profileKey={profileKey}
        removeAction={removeContentTestimonialAction}
        testimonials={testimonials}
        updateAction={updateContentTestimonialAction}
        venueLabel={profile.label}
      />
    </div>);

}

function VenueTabs({ active }: { active: ContentProfileKey }) {
  return (
    <nav aria-label="Venue profiles" className="content-venue-tabs">
      {contentProfileLabels().map(({ key, label }) => (
        <Link
          aria-current={key === active ? "page" : undefined}
          className="content-venue-tab"
          data-active={key === active}
          href={`/admin/modules/content?profile=${key}`}
          key={key}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

type AdminMediaAsset = Parameters<typeof mediaAssetDisplayUrl>[0];

function adminImageUrl(imageUrl: string, mediaAsset: AdminMediaAsset | null) {
  if (mediaAsset) return mediaAssetDisplayUrl(mediaAsset, MediaVariantType.CARD);
  return imageUrl || "";
}

function canUploadWithDriver(driver: MediaDriver) {
  return isMediaUploadDriverConfigured(driver);
}

function savedContentMessage(saved: string, venueLabel: string) {
  if (saved === "testimonial") return "Testimonial published.";
  if (saved === "testimonial-updated") return "Testimonial updated.";
  if (saved === "testimonial-removed") return "Testimonial removed.";
  if (saved === "featured") return `${venueLabel} featured booking card saved.`;
  if (saved === "curation") return `${venueLabel} testimonial curation saved.`;
  if (saved === "hero" || saved === "1") return `${venueLabel} header saved.`;
  return "Content saved.";
}
