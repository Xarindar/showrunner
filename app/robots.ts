import type { MetadataRoute } from "next";
import { getCanonicalBaseUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const baseUrl = await getCanonicalBaseUrl();

  return {
    rules: {
      allow: "/",
      disallow: ["/admin", "/api/internal", "/billing"]
    },
    sitemap: `${baseUrl}/sitemap.xml`
  };
}
