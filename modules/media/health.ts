import "server-only";

import { MediaDriver } from "@prisma/client";
import { isR2Configured } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { warning, type ModuleHealthCheck } from "@/lib/platform-health";

export const getHealth: ModuleHealthCheck = async ({ settings }) => {
  const warnings = [];
  const mediaAssetCount = await prisma.mediaAsset.count({ where: { siteId: settings.siteId } });

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

  if (mediaAssetCount === 0) {
    warnings.push(warning("No media assets", "Media is enabled, but no assets have been uploaded or recorded yet.", "info", "media", "/admin/modules/media"));
  }

  return warnings;
};
