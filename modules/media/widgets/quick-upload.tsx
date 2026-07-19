import { isMediaUploadDriverConfigured } from "@/lib/media";
import { getSiteSettingsForSite } from "@/lib/site";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { QuickUploadClient } from "./quick-upload-client";

export const quickUploadWidget = {
  defaultSize: "md",
  description: "Start a media upload from the dashboard by choosing or dropping an image.",
  id: "media.quick-upload",
  moduleId: "media",
  sizes: ["sm", "md", "lg"],
  title: "Quick upload",
  async render({ preview, siteId }) {
    if (preview) return <QuickUploadClient canUpload mediaDriver="SERVER_ASSETS" preview />;

    const settings = await getSiteSettingsForSite(siteId);
    return (
      <QuickUploadClient
        canUpload={isMediaUploadDriverConfigured(settings.mediaDriver)}
        mediaDriver={settings.mediaDriver}
      />
    );
  }
} satisfies DashboardWidgetDefinition;
