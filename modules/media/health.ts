import "server-only";

import { MediaDriver } from "@prisma/client";
import { isCloudflareImagesConfigured, isR2Configured, isS3Configured, mediaVariantPresets } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { warning, type ModuleHealthCheck } from "@/lib/platform-health";

export const getHealth: ModuleHealthCheck = async ({ settings }) => {
  const warnings = [];
  const [mediaAssetCount, generatedR2VariantCount, generatedS3VariantCount, generatedServerVariantCount] = await Promise.all([
    prisma.mediaAsset.count({ where: { siteId: settings.siteId } }),
    prisma.mediaAssetVariant.count({
      where: {
        asset: { driver: MediaDriver.R2, siteId: settings.siteId },
        metadata: {
          path: ["generatedBy"],
          equals: "sharp-r2"
        }
      }
    }),
    prisma.mediaAssetVariant.count({
      where: {
        asset: { driver: MediaDriver.S3, siteId: settings.siteId },
        metadata: {
          path: ["generatedBy"],
          equals: "sharp-s3"
        }
      }
    }),
    prisma.mediaAssetVariant.count({
      where: {
        asset: { driver: MediaDriver.SERVER_ASSETS, siteId: settings.siteId },
        metadata: {
          path: ["generatedBy"],
          equals: "sharp-server-assets"
        }
      }
    })
  ]);

  if (settings.mediaDriver === MediaDriver.R2 && !isR2Configured()) {
    warnings.push(
      warning(
        "R2 uploads not configured",
        "Media mode is R2, but the required R2 environment variables are missing.",
        "critical",
        "media",
        "/admin/modules/settings"
      )
    );
  }

  if (settings.mediaDriver === MediaDriver.S3 && !isS3Configured()) {
    warnings.push(
      warning(
        "S3 uploads not configured",
        "Media mode is S3, but the required bucket environment variables are missing.",
        "critical",
        "media",
        "/admin/modules/settings"
      )
    );
  }

  if (settings.mediaDriver === MediaDriver.CLOUDFLARE_IMAGES && !isCloudflareImagesConfigured()) {
    warnings.push(
      warning(
        "Cloudflare Images not configured",
        "Media mode is Cloudflare Images, but the required Cloudflare Images environment variables are missing.",
        "critical",
        "media",
        "/admin/modules/settings"
      )
    );
  }

  if (mediaAssetCount === 0) {
    warnings.push(warning("No media assets", "Media is enabled, but no assets have been uploaded or recorded yet.", "info", "media", "/admin/modules/media"));
  }

  if (settings.mediaDriver === MediaDriver.R2 && mediaAssetCount > 0 && generatedR2VariantCount === 0) {
    warnings.push(
      warning(
        "R2 variants generate on first view",
        `Responsive R2 variants (${Object.keys(mediaVariantPresets).join(", ")}) are generated and cached when gallery/media routes first request them.`,
        "info",
        "media",
        "/admin/modules/media"
      )
    );
  }

  if (settings.mediaDriver === MediaDriver.S3 && mediaAssetCount > 0 && generatedS3VariantCount === 0) {
    warnings.push(
      warning(
        "S3 variants generate on first view",
        `Responsive S3 variants (${Object.keys(mediaVariantPresets).join(", ")}) are generated and cached when gallery/media routes first request them.`,
        "info",
        "media",
        "/admin/modules/media"
      )
    );
  }

  if (settings.mediaDriver === MediaDriver.SERVER_ASSETS && mediaAssetCount > 0 && generatedServerVariantCount === 0) {
    warnings.push(
      warning(
        "Server asset variants generate on first view",
        `Responsive server-folder variants (${Object.keys(mediaVariantPresets).join(", ")}) are generated and cached beside the uploaded originals when media routes first request them.`,
        "info",
        "media",
        "/admin/modules/media"
      )
    );
  }

  return warnings;
};
