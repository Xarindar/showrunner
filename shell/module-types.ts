import type { ReactNode } from "react";
import type { AdminRole } from "@prisma/client";
import type { AdminPermission } from "@/lib/admin-permissions";
import type { ModuleIconName } from "@/shell/module-icons";

export type { ModuleIconName };
export type ModuleLayout = "standard" | "wide" | "workspace" | "fullscreen";
export type ModuleStatus = "active" | "future";
export type ModuleReadinessLevel = "live" | "partial" | "admin-foundation" | "manual" | "planned";
export type ModuleOperatingMode = "live" | "mixed" | "manual" | "admin-only" | "planned";
export type ModuleCapabilityStatus = "live" | "manual" | "foundation" | "planned" | "missing";
export type ModulePageComponent = (props: { searchParams: Promise<Record<string, string | undefined>> }) => ReactNode | Promise<ReactNode>;

export type ModuleCapability = {
  label: string;
  status: ModuleCapabilityStatus;
  note?: string;
};

export type ModuleReadiness = {
  level: ModuleReadinessLevel;
  mode: ModuleOperatingMode;
  summary: string;
  primaryGap?: string;
};

/**
 * "ALL" = role can see/manage every record in the module (site-wide).
 * "OWN" = role is restricted to records it owns, per `ModuleDataScope.ownerKind`.
 */
export type DataScopeMode = "ALL" | "OWN";

/**
 * The two generic ownership shapes that cover every scoped record in the
 * platform. The scope engine (lib/data-scope.ts) reads this declaration
 * instead of hardcoding per-module record-ownership logic.
 *
 * - "staff-field": the record has a direct FK to StaffMember (e.g. Booking.staffId,
 *   PortfolioGallery.photographerId, MediaAsset.uploadedByStaffId). Ownership = the
 *   staff member matching the admin's email owns records where ownerField is in
 *   their staff ids.
 * - "client-link": the record either IS a Client (ownerField "id") or has an FK to
 *   Client (e.g. FormSubmission.clientId, Testimonial.clientId). Ownership is derived
 *   from the same staff-id resolution, generically expanded to "clients owned by
 *   those staff" (via bookings and, for photographers, gallery access).
 */
export type DataScopeOwnerKind = "staff-field" | "client-link";

export type ModuleDataScope = {
  ownerKind: DataScopeOwnerKind;
  /** Prisma field name carrying the ownership link (see DataScopeOwnerKind). */
  ownerField: string;
  /** Roles that owners can configure to "OWN" for this module; all other roles stay "ALL". */
  scopableRoles: AdminRole[];
};

export type ShellModule = {
  id: string;
  label: string;
  href: string;
  icon: ModuleIconName;
  order: number;
  description: string;
  layout: ModuleLayout;
  status: ModuleStatus;
  enabledByDefault: boolean;
  required?: boolean;
  readiness: ModuleReadiness;
  capabilities?: ModuleCapability[];
  adminRoutes?: string[];
  publicRoutes?: string[];
  widgetRoutes?: string[];
  dependencies?: string[];
  dataModels?: string[];
  permissions?: AdminPermission[];
  settingsSections?: string[];
  healthChecks?: string[];
  dataScope?: ModuleDataScope;
};
