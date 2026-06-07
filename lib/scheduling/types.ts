import type { Booking, Service } from "@prisma/client";

export type Slot = {
  startsAt: Date;
  endsAt: Date;
  label: string;
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
  createBooking(input: BookingRequest): Promise<Booking>;
};
