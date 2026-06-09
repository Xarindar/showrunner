import { AnalyticsEventType, AutomationTrigger } from "@prisma/client";
import type { ModuleEventSlice } from "@/lib/events/types";

export const billingEvents = {
  "invoice.overdue": {
    analyticsEventName: "invoice overdue",
    analyticsEventType: AnalyticsEventType.CUSTOM,
    automationTrigger: AutomationTrigger.INVOICE_OVERDUE,
    relatedType: "billing_document"
  }
} as const satisfies ModuleEventSlice;
