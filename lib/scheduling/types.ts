import type { Booking, BookingStatus, Prisma } from "@prisma/client";

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

export type ActiveService = Prisma.ServiceGetPayload<{
  include: {
    mediaAsset: true;
    resourceAssignments: {
      include: { resource: true };
    };
    staffAssignments: {
      include: { staff: true };
    };
  };
}>;

export type BookingRequest = {
  siteId?: string;
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
  status?: BookingStatus;
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
  listActiveServices(options?: { siteId?: string }): Promise<ActiveService[]>;
  getAvailableSlots(
    serviceId: string,
    date: Date,
    options?: { resourceId?: string; siteId?: string; staffId?: string; excludeBookingId?: string }
  ): Promise<Slot[]>;
  getSlotDiagnostics(
    serviceId: string,
    date: Date,
    options?: { resourceId?: string; siteId?: string; staffId?: string; excludeBookingId?: string }
  ): Promise<SlotDiagnostics | null>;
  createBooking(input: BookingRequest): Promise<Booking>;
};
