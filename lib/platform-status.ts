import "server-only";

import { getSiteSettings, type SiteSettingsWithModules } from "@/lib/site";
import {
  envLooksDefault,
  warning,
  type ModuleHealthCheck,
  type ModuleHealthContext,
  type PlatformWarning
} from "@/lib/platform-health";
import { moduleRegistry, type ModuleId } from "@/shell/modules";
import type { ModuleCapabilityStatus, ModuleReadinessLevel, ShellModule } from "@/shell/module-types";

export type { PlatformWarning, PlatformWarningSeverity } from "@/lib/platform-health";

export type ModuleReadinessSummary = {
  module: ShellModule;
  enabled: boolean;
  required: boolean;
  readinessLabel: string;
  modeLabel: string;
  pillClassName: string;
  capabilityCounts: Record<ModuleCapabilityStatus, number>;
  warnings: PlatformWarning[];
  hasPublicRoute: boolean;
};

export type PlatformStatus = {
  modules: ModuleReadinessSummary[];
  warnings: PlatformWarning[];
  enabledCount: number;
  manualCount: number;
  adminFoundationCount: number;
  liveCount: number;
};

export type PlatformFoundationItem = {
  key: string;
  title: string;
  status: "planned" | "schema-needed" | "schema-ready" | "policy-needed";
  detail: string;
  models: string[];
};

export const platformFoundationItems: PlatformFoundationItem[] = [
  {
    key: "site-tenant",
    title: "Site and tenant boundary",
    status: "schema-ready",
    detail: "Tenant, Site, and SiteDomain scope records and resolve registered hostnames. Site-owned records carry siteId and composite uniques.",
    models: ["Tenant", "Site", "SiteDomain"]
  },
  {
    key: "module-installation",
    title: "Module installation records",
    status: "schema-ready",
    detail: "ModuleInstallation owns per-site enablement. Settings and module choices save atomically; ModuleSetting stores per-module configuration.",
    models: ["ModuleInstallation", "ModuleSetting"]
  },
  {
    key: "audit-log",
    title: "Audit log",
    status: "schema-ready",
    detail: "AuditLog exists with actor, site, target, request, and metadata fields. Sign-in, settings changes, and CSV exports are wired; broaden coverage across deletes, payments, refunds, access, and role changes.",
    models: ["AuditLog"]
  },
  {
    key: "roles-permissions",
    title: "Roles and permissions",
    status: "schema-ready",
    detail: "AdminUser.role is a typed role with shared permission helpers and first enforcement points. Dedicated role tables, module-scoped overrides, and record ownership rules remain future work.",
    models: ["AdminRole", "AdminUser"]
  },
  {
    key: "security-controls",
    title: "Session and request hardening",
    status: "policy-needed",
    detail: "Signed sessions, database-backed login throttling, site API keys and allowed-origin checks are implemented. MFA, session revocation and data export/delete policies remain future work.",
    models: ["AdminUser", "PublicRateLimit", "SiteApiKey"]
  }
];

const capabilityStatuses: ModuleCapabilityStatus[] = ["live", "manual", "foundation", "planned", "missing"];

function readinessLabel(level: ModuleReadinessLevel) {
  const labels = {
    live: "Live",
    partial: "Partial",
    "admin-foundation": "Admin foundation",
    manual: "Manual",
    planned: "Planned"
  } satisfies Record<ModuleReadinessLevel, string>;

  return labels[level];
}

function modeLabel(mode: ShellModule["readiness"]["mode"]) {
  const labels = {
    live: "Live",
    mixed: "Mixed",
    manual: "Manual",
    "admin-only": "Admin-only",
    planned: "Planned"
  } satisfies Record<ShellModule["readiness"]["mode"], string>;

  return labels[mode];
}

function readinessPillClassName(level: ModuleReadinessLevel) {
  if (level === "live") return "pill success";
  if (level === "planned") return "pill";
  if (level === "manual") return "pill danger";
  return "pill warning";
}

function capabilityCounts(module: ShellModule) {
  const counts = Object.fromEntries(capabilityStatuses.map((status) => [status, 0])) as Record<ModuleCapabilityStatus, number>;

  for (const capability of module.capabilities || []) {
    counts[capability.status] += 1;
  }

  return counts;
}

function isEnabled(settings: SiteSettingsWithModules, moduleId: string) {
  return settings.enabledModuleIds.includes(moduleId as ModuleId);
}

const moduleHealthChecks: Partial<Record<ModuleId, () => Promise<{ getHealth: ModuleHealthCheck }>>> = {
  analytics: () => import("@/modules/analytics/health"),
  automation: () => import("@/modules/automation/health"),
  billing: () => import("@/modules/billing/health"),
  communications: () => import("@/modules/communications/health"),
  deployments: () => import("@/modules/deployments/health"),
  forms: () => import("@/modules/forms/health"),
  media: () => import("@/modules/media/health"),
  portfolio: () => import("@/modules/portfolio/health"),
  products: () => import("@/modules/products/health"),
  scheduling: () => import("@/modules/scheduling/health"),
  testimonials: () => import("@/modules/testimonials/health")
};

async function collectModuleWarnings(ctx: ModuleHealthContext): Promise<PlatformWarning[]> {
  const enabledModules = moduleRegistry.filter((module) => isEnabled(ctx.settings, module.id));

  const results = await Promise.all(
    enabledModules.map(async (module) => {
      const loadHealth = moduleHealthChecks[module.id];
      if (!loadHealth) return [];

      try {
        const { getHealth } = await loadHealth();
        return await getHealth(ctx);
      } catch (error) {
        console.error("[platform-status:module-health-failed]", module.id, error);
        return [warning(`${module.label} health check unavailable`, "Refresh to try again. If this continues, contact your administrator.", "warning", module.id, module.href)];
      }
    })
  );

  return results.flat();
}

// Platform-level checks that are not owned by any single module.
function collectPlatformWarnings(): PlatformWarning[] {
  const warnings: PlatformWarning[] = [];

  if (envLooksDefault(process.env.AUTH_SECRET) || (process.env.AUTH_SECRET?.length ?? 0) < 32) {
    warnings.push(
      warning(
        "AUTH_SECRET should be hardened",
        "Set a unique AUTH_SECRET of at least 32 characters. Production sign-in requires it.",
        process.env.NODE_ENV === "production" ? "critical" : "info",
        "settings",
        "/admin/modules/settings"
      )
    );
  }

  return warnings;
}

export async function getPlatformStatus(settingsInput?: SiteSettingsWithModules): Promise<PlatformStatus> {
  const settings = settingsInput || (await getSiteSettings());
  const ctx: ModuleHealthContext = { settings, now: new Date() };

  const moduleWarnings = await collectModuleWarnings(ctx);
  const warnings = [...moduleWarnings, ...collectPlatformWarnings()];

  const warningsByModule = new Map<ModuleId, PlatformWarning[]>();
  for (const item of warnings) {
    if (!item.moduleId) continue;
    warningsByModule.set(item.moduleId, [...(warningsByModule.get(item.moduleId) || []), item]);
  }

  const modules = moduleRegistry.map((module) => {
    const moduleId = module.id as ModuleId;

    return {
      module,
      enabled: isEnabled(settings, module.id),
      required: Boolean(module.required),
      readinessLabel: readinessLabel(module.readiness.level),
      modeLabel: modeLabel(module.readiness.mode),
      pillClassName: readinessPillClassName(module.readiness.level),
      capabilityCounts: capabilityCounts(module),
      warnings: warningsByModule.get(moduleId) || [],
      hasPublicRoute: Boolean(module.publicRoutes?.length)
    } satisfies ModuleReadinessSummary;
  });

  return {
    modules,
    warnings,
    enabledCount: modules.filter((item) => item.enabled).length,
    manualCount: modules.filter((item) => item.enabled && item.module.readiness.mode === "manual").length,
    adminFoundationCount: modules.filter((item) => item.enabled && item.module.readiness.level === "admin-foundation").length,
    liveCount: modules.filter((item) => item.enabled && ["live", "mixed"].includes(item.module.readiness.mode)).length
  };
}
