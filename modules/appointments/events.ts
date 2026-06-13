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
  },
  "booking.request.approved": {
    analyticsEventName: "booking request approved",
    analyticsEventType: AnalyticsEventType.CUSTOM,
    automationTrigger: AutomationTrigger.BOOKING_REQUEST_APPROVED,
    relatedType: "booking"
  },
  "booking.waitlist.joined": {
    analyticsEventName: "booking waitlist joined",
    analyticsEventType: AnalyticsEventType.CUSTOM,
    automationTrigger: AutomationTrigger.BOOKING_WAITLIST_JOINED,
    relatedType: "booking_waitlist_entry"
  },
  "booking.waitlist.promoted": {
    analyticsEventName: "booking waitlist promoted",
    analyticsEventType: AnalyticsEventType.CUSTOM,
    automationTrigger: AutomationTrigger.BOOKING_WAITLIST_PROMOTED,
    relatedType: "booking_waitlist_entry"
  },
  "booking.waitlist.declined": {
    analyticsEventName: "booking waitlist declined",
    analyticsEventType: AnalyticsEventType.CUSTOM,
    automationTrigger: AutomationTrigger.BOOKING_WAITLIST_DECLINED,
    relatedType: "booking_waitlist_entry"
  }
} as const satisfies ModuleEventSlice;
