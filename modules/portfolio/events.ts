import { AnalyticsEventType, AutomationTrigger } from "@prisma/client";
import type { ModuleEventSlice } from "@/lib/events/types";

export const portfolioEvents = {
  "gallery.viewed": {
    analyticsEventName: "gallery viewed",
    analyticsEventType: AnalyticsEventType.GALLERY_VIEWED,
    automationTrigger: AutomationTrigger.GALLERY_VIEWED,
    relatedType: "portfolio_gallery"
  },
  "favorite.added": {
    analyticsEventName: "favorite added",
    analyticsEventType: AnalyticsEventType.FAVORITE_ADDED,
    automationTrigger: AutomationTrigger.FAVORITE_ADDED,
    relatedType: "portfolio_gallery_favorite"
  },
  "gallery.approved": {
    analyticsEventName: "gallery approved",
    analyticsEventType: AnalyticsEventType.CUSTOM,
    automationTrigger: AutomationTrigger.GALLERY_APPROVED,
    relatedType: "portfolio_gallery"
  }
} as const satisfies ModuleEventSlice;
