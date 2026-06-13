import { AnalyticsEventType, AutomationTrigger } from "@prisma/client";
import type { ModuleEventSlice } from "@/lib/events/types";

export const productEvents = {
  "order.paid": {
    analyticsEventName: "purchase",
    analyticsEventType: AnalyticsEventType.PURCHASE,
    automationTrigger: AutomationTrigger.ORDER_PAID,
    relatedType: "order"
  },
  "order.fulfilled": {
    analyticsEventName: "order_fulfilled",
    analyticsEventType: AnalyticsEventType.CUSTOM,
    automationTrigger: AutomationTrigger.ORDER_FULFILLED,
    relatedType: "order"
  }
} as const satisfies ModuleEventSlice;
