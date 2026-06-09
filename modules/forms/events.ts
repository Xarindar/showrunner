import { AnalyticsEventType, AutomationTrigger } from "@prisma/client";
import type { ModuleEventSlice } from "@/lib/events/types";

export const formEvents = {
  "form.submitted": {
    analyticsEventName: "lead submitted",
    analyticsEventType: AnalyticsEventType.LEAD_SUBMITTED,
    automationTrigger: AutomationTrigger.FORM_SUBMITTED,
    relatedType: "form_submission"
  }
} as const satisfies ModuleEventSlice;
