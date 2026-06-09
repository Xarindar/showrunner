"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emitModuleEvent, requestAttribution } from "@/lib/events/emit";
import { nativeSchedulingAdapter } from "@/lib/scheduling/native";

const bookingSchema = z.object({
  serviceId: z.string().min(1),
  startsAt: z.string().min(1).refine((value) => !Number.isNaN(new Date(value).getTime()), "Choose a valid appointment time."),
  customerName: z.string().trim().min(2, "Add your name."),
  customerEmail: z.email("Add a valid email.").transform((value) => value.trim().toLowerCase()),
  customerPhone: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  intakeResponse: z.string().trim().optional(),
  policyAccepted: z.string().optional()
});

export type BookingFormState = {
  ok?: boolean;
  error?: string;
};

export async function createPublicBookingAction(_state: BookingFormState, formData: FormData): Promise<BookingFormState> {
  const parsed = bookingSchema.safeParse({
    serviceId: formData.get("serviceId"),
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
        startsAt: parsed.data.startsAt
      },
      relatedId: booking.id,
      relatedType: "booking"
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to create booking." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/modules/appointments");
  revalidatePath("/admin/modules/clients");
  revalidatePath("/admin/modules/scheduling");
  revalidatePath("/book");
  return { ok: true };
}
