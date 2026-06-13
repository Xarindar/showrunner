import type { MetadataRoute } from "next";
import { FormStatus, PortfolioGalleryStatus, PortfolioGalleryVisibility, ProductStatus, TestimonialStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { absoluteUrl, getCanonicalBaseUrl } from "@/lib/seo";
import { getSiteSettings } from "@/lib/site";

export const dynamic = "force-dynamic";

type SitemapEntry = MetadataRoute.Sitemap[number] & {
  images?: string[];
};

function uniqueImages(values: Array<string | null | undefined>, baseUrl: string) {
  return [...new Set(values.map((value) => absoluteUrl(value, baseUrl)).filter(Boolean))];
}

export default async function sitemap(): Promise<SitemapEntry[]> {
  const settings = await getSiteSettings();
  const baseUrl = await getCanonicalBaseUrl(settings.siteId);
  const modules = new Set(settings.enabledModuleIds);
  const now = new Date();
  const entries: SitemapEntry[] = [
    {
      changeFrequency: "weekly",
      images: uniqueImages([settings.heroImageUrl], baseUrl),
      lastModified: settings.updatedAt,
      priority: 1,
      url: `${baseUrl}/`
    }
  ];

  if (modules.has("products")) {
    const products = await prisma.product.findMany({
      where: { siteId: settings.siteId, status: ProductStatus.ACTIVE },
      select: { imageUrl: true, slug: true, updatedAt: true }
    });

    entries.push({
      changeFrequency: "weekly",
      lastModified: now,
      priority: 0.8,
      url: `${baseUrl}/shop`
    });
    entries.push(
      ...products.map((product) => ({
        changeFrequency: "weekly" as const,
        images: uniqueImages([product.imageUrl], baseUrl),
        lastModified: product.updatedAt,
        priority: 0.7,
        url: `${baseUrl}/shop/${product.slug}`
      }))
    );
  }

  if (modules.has("forms")) {
    const forms = await prisma.form.findMany({
      where: { siteId: settings.siteId, status: FormStatus.ACTIVE },
      select: { slug: true, updatedAt: true }
    });

    entries.push(
      ...forms.map((form) => ({
        changeFrequency: "monthly" as const,
        lastModified: form.updatedAt,
        priority: 0.5,
        url: `${baseUrl}/forms/${form.slug}`
      }))
    );
  }

  if (modules.has("testimonials")) {
    const latestTestimonial = await prisma.testimonial.findFirst({
      where: {
        siteId: settings.siteId,
        status: TestimonialStatus.APPROVED,
        permissionGranted: true
      },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true }
    });

    entries.push({
      changeFrequency: "weekly",
      lastModified: latestTestimonial?.updatedAt || settings.updatedAt,
      priority: 0.6,
      url: `${baseUrl}/testimonials`
    });
  }

  if (modules.has("portfolio")) {
    const galleries = await prisma.portfolioGallery.findMany({
      where: {
        siteId: settings.siteId,
        status: PortfolioGalleryStatus.PUBLISHED,
        visibility: PortfolioGalleryVisibility.PUBLIC
      },
      include: {
        items: {
          orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
          select: { imageUrl: true, thumbnailUrl: true }
        }
      }
    });

    entries.push(
      ...galleries.map((gallery) => ({
        changeFrequency: "weekly" as const,
        images: uniqueImages([gallery.coverImageUrl, ...gallery.items.flatMap((item) => [item.imageUrl, item.thumbnailUrl])], baseUrl),
        lastModified: gallery.updatedAt,
        priority: 0.65,
        url: `${baseUrl}/galleries/${gallery.slug}`
      }))
    );
  }

  return entries;
}
