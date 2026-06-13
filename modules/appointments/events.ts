import { AnalyticsEventType, AutomationTrigger } from "@prisma/client";
import type { ModuleEventSlice } from "@/lib/events/types";

export const appointmentEvents = {
  "booking.created": {
    analyticsEventName: "booking completed",
    analyticsEventType: AnalyticsEventType.BOOKING_COMPLETED,
    automationTrigger: AutomationTrigger.BOOKING_CREATED,
    relatedType: "booking"
  },
  "booking.canceled": {
    analyticsEventName: "booking canceled",
    analyticsEventType: AnalyticsEventType.CUSTOM,
    automationTrigger: AutomationTrigger.BOOKING_CANCELED,
    relatedType: "booking"
  },
  "booking.rescheduled": {
    analyticsEventName: "booking rescheduled",
    analyticsEventType: AnalyticsEventType.CUSTOM,
    automationTrigger: AutomationTrigger.BOOKING_RESCHEDULED,
    relatedType: "booking"
  }
} as const satisfies ModuleEventSlice;
