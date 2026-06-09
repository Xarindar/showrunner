import type { Booking, Service } from "@prisma/client";

export type Slot = {
  startsAt: Date;
  endsAt: Date;
  label: string;
};

export type SlotDiagnosticReason = {
  code: "minimum_notice" | "max_advance" | "booking_conflict" | "blockout_conflict";
  message: string;
};

export type SlotDiagnostic = Slot & {
  available: boolean;
  reasons: SlotDiagnosticReason[];
};

export type SlotDiagnostics = {
  serviceId: string;
  serviceName: string;
  timezone: string;
  ruleCount: number;
  slotCount: number;
  availableCount: number;
  messages: string[];
  slots: SlotDiagnostic[];
};

export type BookingRequest = {
  serviceId: string;
  startsAt: Date;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  notes?: string;
  intakeResponse?: string;
  policyAccepted?: boolean;
};

export type SchedulingAdapter = {
  listActiveServices(): Promise<Service[]>;
  getAvailableSlots(serviceId: string, date: Date): Promise<Slot[]>;
  getSlotDiagnostics(serviceId: string, date: Date, options?: { excludeBookingId?: string }): Promise<SlotDiagnostics | null>;
  createBooking(input: BookingRequest): Promise<Booking>;
};
