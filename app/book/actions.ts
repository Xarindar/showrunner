"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emitModuleEvent, requestAttribution } from "@/lib/events/emit";
import { bookingSelfServicePath } from "@/lib/bookings/self-service";
import { icsCalendarAdapter } from "@/lib/scheduling/calendar";
import { nativeSchedulingAdapter } from "@/lib/scheduling/native";

const bookingSchema = z.object({
  serviceId: z.string().min(1),
  staffId: z.string().trim().optional(),
  resourceIds: z.string().trim().optional(),
  startsAt: z.string().min(1).refine((value) => !Number.isNaN(new Date(value).getTime()), "Choose a valid appointment time."),
  customerName: z.string().trim().min(2, "Add your name."),
  customerEmail: z.email("Add a valid email.").transform((value) => value.trim().toLowerCase()),
  customerPhone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  intakeResponse: z.string().trim().optional(),
  policyAccepted: z.string().optional()
});

export type BookingFormState = {
  calendarUrl?: string;
  manageUrl?: string;
  ok?: boolean;
  error?: string;
};

export async function createPublicBookingAction(_state: BookingFormState, formData: FormData): Promise<BookingFormState> {
  const parsed = bookingSchema.safeParse({
    serviceId: formData.get("serviceId"),
    staffId: formData.get("staffId") || undefined,
    resourceIds: formData.get("resourceIds") || undefined,
    startsAt: formData.get("startsAt"),
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    customerPhone: formData.get("customerPhone"),
    notes: formData.get("notes"),
    intakeResponse: formData.get("intakeResponse"),
    policyAccepted: formData.get("policyAccepted")
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Check the booking form." };
  }

  try {
    const booking = await nativeSchedulingAdapter.createBooking({
      serviceId: parsed.data.serviceId,
      staffId: parsed.data.staffId,
      resourceIds: parsed.data.resourceIds?.split(",").map((id) => id.trim()).filter(Boolean),
      startsAt: new Date(parsed.data.startsAt),
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail,
      customerPhone: parsed.data.customerPhone,
      notes: parsed.data.notes,
      intakeResponse: parsed.data.intakeResponse,
      policyAccepted: parsed.data.policyAccepted === "on"
    });
    await emitModuleEvent("booking.created", {
      ...(await requestAttribution(undefined, "/book")),
      actorEmail: parsed.data.customerEmail,
      metadata: {
        serviceId: parsed.data.serviceId,
        resourceIds: parsed.data.resourceIds,
        staffId: parsed.data.staffId,
        startsAt: parsed.data.startsAt
      },
      relatedId: booking.id,
      relatedType: "booking"
    });
    revalidatePath("/admin");
    revalidatePath("/admin/modules/appointments");
    revalidatePath("/admin/modules/clients");
    revalidatePath("/admin/modules/scheduling");
    revalidatePath("/book");
    return {
      calendarUrl: icsCalendarAdapter.bookingPath({ bookingId: booking.id, siteId: booking.siteId }),
      manageUrl: bookingSelfServicePath({ bookingId: booking.id, customerEmail: booking.customerEmail, siteId: booking.siteId }),
      ok: true
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to create booking." };
  }
}
