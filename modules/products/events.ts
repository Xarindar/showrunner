import { AnalyticsEventType, AutomationTrigger } from "@prisma/client";
import type { ModuleEventSlice } from "@/lib/events/types";

export const productEvents = {
  "order.paid": {
    analyticsEventName: "purchase",
    analyticsEventType: AnalyticsEventType.PURCHASE,
    automationTrigger: AutomationTrigger.ORDER_PAID,
    relatedType: "order"
  }
} as const satisfies ModuleEventSlice;
