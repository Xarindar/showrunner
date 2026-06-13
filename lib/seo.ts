import type { Metadata } from "next";
import type { SiteSettingsWithModules } from "@/lib/site";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

type PageMetadataInput = {
  canonicalPath: string;
  description?: string;
  image?: string;
  robots?: Metadata["robots"];
  title: string;
};

type BreadcrumbItem = {
  name: string;
  path: string;
};

type ProductJsonLdInput = {
  baseUrl: string;
  categories?: string[];
  currency: string;
  description: string;
  imageUrl?: string;
  name: string;
  path: string;
  priceCents: number;
  sku?: string | null;
};

type ImageJsonLdInput = {
  baseUrl: string;
  caption?: string;
  description?: string;
  name: string;
  url: string;
};

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function cleanPath(path: string) {
  if (!path || path === "/") return "/";
  return `/${path.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function trimText(value: string | null | undefined, fallback = "") {
  return value?.trim() || fallback;
}

export function absoluteUrl(pathOrUrl: string | null | undefined, baseUrl: string) {
  const value = pathOrUrl?.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  return `${baseUrl}${value.startsWith("/") ? value : `/${value}`}`;
}

export async function getCanonicalBaseUrl(siteId?: string) {
  try {
    const headerStore = await headers();
    const host = headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
    if (host) {
      const proto = headerStore.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
      return normalizeBaseUrl(`${proto}://${host.split(",")[0].trim()}`);
    }
  } catch {
    // Static metadata routes may run without request headers.
  }

  const configured = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL || "");
  if (configured) return configured;

  if (siteId) {
    const domain = await prisma.siteDomain.findFirst({
      where: { siteId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { hostname: true }
    });
    const domainUrl = normalizeBaseUrl(domain?.hostname || "");
    if (domainUrl) return domainUrl;
  }

  return "http://localhost:3000";
}

export async function buildPageMetadata(settings: SiteSettingsWithModules, input: PageMetadataInput): Promise<Metadata> {
  const baseUrl = await getCanonicalBaseUrl(settings.siteId);
  const canonicalPath = cleanPath(input.canonicalPath);
  const title = input.title === settings.businessName ? input.title : `${input.title} | ${settings.businessName}`;
  const description = trimText(input.description, settings.heroSubheadline);
  const image = absoluteUrl(input.image || settings.heroImageUrl, baseUrl);

  return {
    alternates: {
      canonical: canonicalPath
    },
    description,
    metadataBase: new URL(baseUrl),
    openGraph: {
      description,
      images: image ? [{ url: image }] : undefined,
      siteName: settings.businessName,
      title,
      type: "website",
      url: canonicalPath
    },
    robots: input.robots,
    title,
    twitter: {
      card: image ? "summary_large_image" : "summary",
      description,
      images: image ? [image] : undefined,
      title
    }
  };
}

export function buildLocalBusinessJsonLd(settings: SiteSettingsWithModules, baseUrl: string) {
  return {
    "@context": "https://schema.org",
    "@id": `${baseUrl}/#local-business`,
    "@type": "LocalBusiness",
    email: settings.contactEmail,
    image: absoluteUrl(settings.heroImageUrl, baseUrl) || undefined,
    name: settings.businessName,
    url: baseUrl
  };
}

export function buildWebSiteJsonLd(settings: SiteSettingsWithModules, baseUrl: string) {
  return {
    "@context": "https://schema.org",
    "@id": `${baseUrl}/#website`,
    "@type": "WebSite",
    name: settings.businessName,
    publisher: { "@id": `${baseUrl}/#local-business` },
    url: baseUrl
  };
}

export function buildImageObjectJsonLd(input: ImageJsonLdInput) {
  const contentUrl = absoluteUrl(input.url, input.baseUrl);
  return {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    caption: trimText(input.caption) || undefined,
    contentUrl,
    description: trimText(input.description) || undefined,
    name: input.name,
    url: contentUrl
  };
}

export function buildProductJsonLd(input: ProductJsonLdInput) {
  const url = absoluteUrl(input.path, input.baseUrl);
  const image = absoluteUrl(input.imageUrl, input.baseUrl);

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    category: input.categories?.length ? input.categories.join(", ") : undefined,
    description: trimText(input.description, input.name),
    image: image || undefined,
    name: input.name,
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      price: (input.priceCents / 100).toFixed(2),
      priceCurrency: input.currency,
      url
    },
    sku: input.sku || undefined,
    url
  };
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[], baseUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      item: absoluteUrl(item.path, baseUrl),
      name: item.name,
      position: index + 1
    }))
  };
}
