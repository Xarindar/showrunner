import type { Booking, Service } from "@prisma/client";

export type Slot = {
  startsAt: Date;
  endsAt: Date;
  label: string;
  resourceIds: string[];
  resourceNames: string[];
  staffId?: string;
  staffName?: string;
};

export type SlotDiagnosticReason = {
  code: "minimum_notice" | "max_advance" | "booking_conflict" | "blockout_conflict" | "google_calendar_conflict";
  message: string;
};

export type SlotDiagnostic = Slot & {
  available: boolean;
  reasons: SlotDiagnosticReason[];
};

export type SlotDiagnostics = {
  serviceId: string;
  serviceName: string;
  resourceIds: string[];
  resourceNames: string[];
  staffId?: string;
  staffName?: string;
  timezone: string;
  ruleCount: number;
  slotCount: number;
  availableCount: number;
  messages: string[];
  slots: SlotDiagnostic[];
};

export type BookingRequest = {
  serviceId: string;
  staffId?: string;
  resourceIds?: string[];
  startsAt: Date;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  notes?: string;
  intakeResponse?: string;
  policyAccepted?: boolean;
};

export type CalendarFeedScope = {
  siteId: string;
  staffId?: string;
};

export type CalendarBookingScope = {
  bookingId: string;
  siteId: string;
};

export type CalendarFileAdapter = {
  bookingPath(input: CalendarBookingScope): string;
  feedPath(input: CalendarFeedScope): string;
};

export type SchedulingAdapter = {
  listActiveServices(): Promise<Service[]>;
  getAvailableSlots(serviceId: string, date: Date, options?: { resourceId?: string; staffId?: string; excludeBookingId?: string }): Promise<Slot[]>;
  getSlotDiagnostics(
    serviceId: string,
    date: Date,
    options?: { resourceId?: string; staffId?: string; excludeBookingId?: string }
  ): Promise<SlotDiagnostics | null>;
  createBooking(input: BookingRequest): Promise<Booking>;
};
