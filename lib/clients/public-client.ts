import "server-only";

import type { Prisma } from "@prisma/client";
import { normalizeClientStatusSettings } from "@/lib/clients/status-settings";
import { isRecord } from "@/lib/objects";

type PublicClientInput = {
  siteId: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  serviceId?: string;
};

/**
 * Create-or-fill-blank upsert for clients created from anonymous public input
 * (booking, waitlist, etc.). It NEVER overwrites an existing client's stored
 * name/phone from public input — it only fills fields that are currently empty —
 * matching the create-only rule the §7/§8 audits established for the forms and
 * testimonials public paths. Returns the client id.
 *
 * The booking caller passes its validated service; repeat bookings update that
 * reference without replacing saved contact details or other preferences.
 * Runs against a transaction client so callers can keep the client write inside
 * the same transaction as the booking/waitlist insert.
 */
export async function upsertPublicClient(tx: Prisma.TransactionClient, input: PublicClientInput) {
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || "";
  const phone = input.phone?.trim() || "";

  const existing = await tx.client.findUnique({
    where: { siteId_email: { siteId: input.siteId, email } },
    select: { id: true, name: true, phone: true, preferences: true }
  });

  if (existing) {
    const data: { name?: string; phone?: string; preferences?: Prisma.InputJsonObject } = {};
    if (!existing.name && name) data.name = name;
    if (!existing.phone && phone) data.phone = phone;
    if (input.serviceId) data.preferences = { ...(isRecord(existing.preferences) ? existing.preferences : {}), serviceId: input.serviceId };
    if (Object.keys(data).length > 0) {
      await tx.client.update({ where: { id: existing.id }, data });
    }
    return existing.id;
  }

  const setting = await tx.moduleSetting.findUnique({ where: { siteId_moduleId_key: { siteId: input.siteId, moduleId: "clients", key: "statuses" } } });
  const statuses = normalizeClientStatusSettings(setting?.value);
  const created = await tx.client.create({
    data: {
      siteId: input.siteId,
      email,
      name: name || email,
      phone: phone || undefined,
      status: statuses.defaultStatus,
      preferences: input.serviceId ? { serviceId: input.serviceId } : {}
    },
    select: { id: true }
  });
  return created.id;
}
