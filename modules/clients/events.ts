import { AnalyticsEventType, AutomationTrigger } from "@prisma/client";
import type { ModuleEventSlice } from "@/lib/events/types";

export const clientEvents = {
  "client.tagged": {
    analyticsEventName: "client tagged",
    analyticsEventType: AnalyticsEventType.CUSTOM,
    automationTrigger: AutomationTrigger.CLIENT_TAGGED,
    relatedType: "client"
  }
} as const satisfies ModuleEventSlice;
