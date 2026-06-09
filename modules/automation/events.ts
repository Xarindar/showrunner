import { AnalyticsEventType, AutomationTrigger } from "@prisma/client";
import type { ModuleEventSlice } from "@/lib/events/types";

export const automationEvents = {
  "automation.manual": {
    analyticsEventName: "automation manual",
    analyticsEventType: AnalyticsEventType.CUSTOM,
    automationTrigger: AutomationTrigger.MANUAL,
    relatedType: "automation"
  }
} as const satisfies ModuleEventSlice;
