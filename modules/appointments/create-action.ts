"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, resolveDataScopeMode, getOwnerStaffIds, getAccessibleClientWhere } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { parseZonedDateTimeInput } from "@/lib/timezone";
import { manualSessionSchema } from "@/lib/scheduling/session-input";
import { createManualSession } from "@/lib/bookings/manual";

type SessionFormState = { error: string; date?: string; time?: string };

export async function createSessionAction(_previous: SessionFormState, formData: FormData): Promise<SessionFormState> {
  const date = String(formData.get("date") || "");
  const time = String(formData.get("time") || "");
  const failure = (error: string): SessionFormState => ({ error, date, time });
  const user = await requireAdmin("appointments:manage");
  const settings = await getSiteSettings();
  const parsed = manualSessionSchema.safeParse({ ...Object.fromEntries(formData), addOnIds: formData.getAll("addOnIds"), startsAt: `${date}T${time}` });
  if (!parsed.success) return failure(parsed.error.issues[0].message);
  const input = parsed.data;
  const existingClient = await prisma.client.findUnique({ where: { siteId_email: { siteId: settings.siteId, email: input.customerEmail } }, select: { id: true } });
  if (existingClient && !await prisma.client.findFirst({ where: await getAccessibleClientWhere(user, settings.siteId, { id: existingClient.id }), select: { id: true } })) {
    return failure("You do not have access to book this client.");
  }
  const startsAt = parseZonedDateTimeInput(input.startsAt, settings.timezone);
  if (!startsAt) return failure("Choose a valid date and time.");
  if (await resolveDataScopeMode(user, settings.siteId, "appointments") !== "ALL") {
    const ownStaff = await getOwnerStaffIds(user, settings.siteId);
    if (!input.staffId || !ownStaff.includes(input.staffId)) return failure("Select yourself as the team member for this session.");
  }
  let booking;
  try {
    booking = await createManualSession({ ...input, startsAt, siteId: settings.siteId, timezone: settings.timezone, priceCents: input.price });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) return failure("The session could not be saved. Check availability and try again.");
    return failure(error instanceof Error ? error.message : "The session could not be saved. Try again.");
  }
  revalidatePath("/admin/modules/appointments");
  revalidatePath("/admin/modules/clients");
  revalidatePath("/admin");
  revalidatePath("/book");
  redirect(`/admin/appointments/${booking.id}?saved=created`);
}
