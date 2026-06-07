"use server";

import { BookingStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { bookingDetailFormSchema, bookingStatusFormSchema, parseForm } from "@/lib/admin-validation";
import { queueBookingStatusEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

function refreshAppointments() {
  revalidatePath("/admin");
  revalidatePath("/admin/modules/appointments");
  revalidatePath("/book");
}

export async function updateBookingStatusAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(bookingStatusFormSchema, formData);

  const current = await prisma.booking.findUnique({
    where: { id: input.id },
    include: { service: true }
  });

  const updated = await prisma.booking.update({
    where: { id: input.id },
    data: { status: input.status as BookingStatus },
    include: { service: true }
  });

  if (current) {
    await queueBookingStatusEmail(updated, current.status);
  }

  refreshAppointments();
}

export async function updateBookingDetailAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(bookingDetailFormSchema, formData);

  await prisma.booking.update({
    where: { id: input.id },
    data: {
      adminNotes: input.adminNotes,
      cancellationReason: input.cancellationReason
    }
  });

  refreshAppointments();
  revalidatePath(`/admin/appointments/${input.id}`);
}
