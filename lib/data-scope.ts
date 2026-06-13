import "server-only";

import { AdminRole, type Prisma } from "@prisma/client";
import type { AdminSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getModule, moduleRegistry } from "@/shell/modules";
import type { DataScopeMode, ModuleDataScope } from "@/shell/module-types";

export type { DataScopeMode };

/**
 * Owner-configurable per-role, per-module data scope. Stored as
 * SiteSettings.dataScopeConfig. Only roles listed in a module's
 * `dataScope.scopableRoles` can have an entry here; any other role/module
 * combination is always "ALL". Missing entries for a scopable role default
 * to "OWN" (the chunk-3 "team" behavior), so existing/fresh sites keep
 * working without configuration.
 */
export type DataScopeConfig = Partial<Record<string, Partial<Record<AdminRole, DataScopeMode>>>>;

const adminRoleValues = new Set<string>(Object.values(AdminRole));

export function parseDataScopeConfig(value: unknown): DataScopeConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const config: DataScopeConfig = {};
  for (const [moduleId, roles] of Object.entries(value as Record<string, unknown>)) {
    if (!roles || typeof roles !== "object" || Array.isArray(roles)) continue;

    const moduleConfig: Partial<Record<AdminRole, DataScopeMode>> = {};
    for (const [role, mode] of Object.entries(roles as Record<string, unknown>)) {
      if ((mode === "ALL" || mode === "OWN") && adminRoleValues.has(role)) {
        moduleConfig[role as AdminRole] = mode;
      }
    }
    config[moduleId] = moduleConfig;
  }

  return config;
}

export function dataScopeConfigFromFormData(formData: FormData): DataScopeConfig {
  const config: DataScopeConfig = {};

  for (const shellModule of scopableModules()) {
    config[shellModule.id] = {};
    for (const role of shellModule.scopableRoles) {
      const value = formData.get(`dataScope:${shellModule.id}:${role}`);
      config[shellModule.id]![role] = value === "ALL" ? "ALL" : "OWN";
    }
  }

  return config;
}

/** Modules that declare at least one owner-configurable role, for the settings matrix. */
export function scopableModules() {
  return moduleRegistry
    .filter((module) => (module.dataScope?.scopableRoles.length ?? 0) > 0)
    .map((module) => ({
      id: module.id,
      label: module.label,
      scopableRoles: module.dataScope!.scopableRoles
    }));
}

export const dataScopePresets = ["single-person", "team"] as const;
export type DataScopePreset = (typeof dataScopePresets)[number];

/**
 * "single-person": every scopable role/module cell -> ALL (one person sees everything).
 * "team": clears all overrides, restoring the default OWN scoping for constrained roles.
 */
export function applyDataScopePreset(preset: DataScopePreset): DataScopeConfig {
  if (preset === "team") return {};

  const config: DataScopeConfig = {};
  for (const shellModule of scopableModules()) {
    config[shellModule.id] = {};
    for (const role of shellModule.scopableRoles) {
      config[shellModule.id]![role] = "ALL";
    }
  }
  return config;
}

async function getDataScopeConfig(siteId: string): Promise<DataScopeConfig> {
  const settings = await prisma.siteSettings.findUnique({
    where: { siteId },
    select: { dataScopeConfig: true }
  });
  return parseDataScopeConfig(settings?.dataScopeConfig);
}

export async function resolveDataScopeMode(user: AdminSessionUser, siteId: string, moduleId: string): Promise<DataScopeMode> {
  const dataScope = getModule(moduleId)?.dataScope;
  if (!dataScope || !dataScope.scopableRoles.includes(user.role)) return "ALL";

  const config = await getDataScopeConfig(siteId);
  return config[moduleId]?.[user.role] ?? "OWN";
}

/** Staff records (if any) matching the admin's email - the generic "staff-field" owner identity. */
export async function getOwnerStaffIds(user: AdminSessionUser, siteId: string): Promise<string[]> {
  const matches = await prisma.staffMember.findMany({
    where: { siteId, email: { equals: user.email, mode: "insensitive" } },
    select: { id: true }
  });

  return matches.map((staff) => staff.id);
}

/**
 * Clients owned by the admin's matched staff records, via either booking
 * assignment or gallery/proofing access (so PHOTOGRAPHER ownership keys on
 * gallery ownership, not booking.staffId). Generic across every role that
 * resolves to one or more staffIds.
 */
async function getOwnedClientIds(user: AdminSessionUser, siteId: string): Promise<string[]> {
  const staffIds = await getOwnerStaffIds(user, siteId);
  if (!staffIds.length) return [];

  const [bookingClients, ownedGalleries] = await Promise.all([
    prisma.client.findMany({
      where: { siteId, bookings: { some: { siteId, staffId: { in: staffIds } } } },
      select: { id: true }
    }),
    prisma.portfolioGallery.findMany({
      where: { siteId, photographerId: { in: staffIds } },
      select: { id: true }
    })
  ]);

  const clientIds = new Set(bookingClients.map((client) => client.id));

  if (ownedGalleries.length) {
    const galleryAccesses = await prisma.portfolioGalleryAccess.findMany({
      where: { siteId, galleryId: { in: ownedGalleries.map((gallery) => gallery.id) }, clientId: { not: null } },
      select: { clientId: true }
    });
    for (const access of galleryAccesses) {
      if (access.clientId) clientIds.add(access.clientId);
    }
  }

  return Array.from(clientIds);
}

/**
 * Policy-driven owner filter: reads the module's manifest `dataScope`
 * (modular ownership mapping) plus the configured scope mode, and returns
 * the Prisma filter fragment for `{ [ownerField]: { in: [...] } }`, or `{}`
 * for ALL scope / modules with no `dataScope` declaration. An empty owner
 * id list naturally fails closed via `{ in: [] }`.
 */
async function getOwnerWhereFragment(moduleId: string, user: AdminSessionUser, siteId: string): Promise<Record<string, unknown>> {
  const dataScope = getModule(moduleId)?.dataScope as ModuleDataScope | undefined;
  if (!dataScope) return {};

  const mode = await resolveDataScopeMode(user, siteId, moduleId);
  if (mode === "ALL") return {};

  const ownerIds = dataScope.ownerKind === "staff-field" ? await getOwnerStaffIds(user, siteId) : await getOwnedClientIds(user, siteId);

  return { [dataScope.ownerField]: { in: ownerIds } };
}

export async function getAccessibleModuleWhere<TWhere extends Record<string, unknown>>(
  moduleId: string,
  user: AdminSessionUser,
  siteId: string,
  siteWhere: TWhere,
  extra: TWhere = {} as TWhere
): Promise<TWhere> {
  const ownerWhere = await getOwnerWhereFragment(moduleId, user, siteId);
  return { AND: [siteWhere, extra, ownerWhere] } as unknown as TWhere;
}

export async function getAccessibleBookingWhere(
  user: AdminSessionUser,
  siteId: string,
  extra: Prisma.BookingWhereInput = {}
): Promise<Prisma.BookingWhereInput> {
  return getAccessibleModuleWhere("appointments", user, siteId, { siteId }, extra);
}

export async function getAccessibleClientWhere(
  user: AdminSessionUser,
  siteId: string,
  extra: Prisma.ClientWhereInput = {}
): Promise<Prisma.ClientWhereInput> {
  return getAccessibleModuleWhere("clients", user, siteId, { siteId }, extra);
}

export async function getAccessibleFormSubmissionWhere(
  user: AdminSessionUser,
  siteId: string,
  extra: Prisma.FormSubmissionWhereInput = {}
): Promise<Prisma.FormSubmissionWhereInput> {
  const ownerWhere = await getOwnerWhereFragment("forms", user, siteId);
  return { AND: [{ form: { siteId } }, extra, ownerWhere as Prisma.FormSubmissionWhereInput] };
}

export async function getAccessibleTestimonialWhere(
  user: AdminSessionUser,
  siteId: string,
  extra: Prisma.TestimonialWhereInput = {}
): Promise<Prisma.TestimonialWhereInput> {
  return getAccessibleModuleWhere("testimonials", user, siteId, { siteId }, extra);
}

export async function getAccessibleGalleryWhere(
  user: AdminSessionUser,
  siteId: string,
  extra: Prisma.PortfolioGalleryWhereInput = {}
): Promise<Prisma.PortfolioGalleryWhereInput> {
  return getAccessibleModuleWhere("portfolio", user, siteId, { siteId }, extra);
}

export async function getAccessibleMediaWhere(
  user: AdminSessionUser,
  siteId: string,
  extra: Prisma.MediaAssetWhereInput = {}
): Promise<Prisma.MediaAssetWhereInput> {
  return getAccessibleModuleWhere("media", user, siteId, { siteId }, extra);
}
