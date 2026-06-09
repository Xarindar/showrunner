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
  status: "planned" | "schema-needed" | "policy-needed";
  detail: string;
  models: string[];
};

export const platformFoundationItems: PlatformFoundationItem[] = [
  {
    key: "site-tenant",
    title: "Site and tenant boundary",
    status: "schema-needed",
    detail: "Add Tenant, Site, and SiteDomain so slugs, coupons, domains, public keys, and access tokens can be scoped before multi-site rollout.",
    models: ["Tenant", "Site", "SiteDomain"]
  },
  {
    key: "module-installation",
    title: "Module installation records",
    status: "schema-needed",
    detail: "Persist installed, enabled, configured, public visibility, beta, dependency, and per-site settings state instead of storing only enabled IDs.",
    models: ["ModuleInstallation", "ModuleSetting"]
  },
  {
    key: "audit-log",
    title: "Audit log",
    status: "schema-needed",
    detail: "Record sensitive create, update, delete, status, export, payment, refund, access, and role-change events with actor and target metadata.",
    models: ["AuditLog"]
  },
  {
    key: "roles-permissions",
    title: "Roles and permissions",
    status: "schema-needed",
    detail: "Replace string-only AdminUser.role with roles, permission sets, module permissions, and record ownership rules.",
    models: ["Role", "Permission", "RolePermission", "AdminUserRole"]
  },
  {
    key: "security-controls",
    title: "Session and request hardening",
    status: "policy-needed",
    detail: "Add persistent login attempts, session revocation, MFA-ready fields, CSRF strategy, signed embed keys, allowed origins, and data export/delete policies.",
    models: ["AdminSession", "LoginAttempt", "SiteApiKey", "AllowedOrigin", "DataRequest"]
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

// Pull an enabled module's own health check (modules/<id>/health.ts) by convention. Modules without
// a health file resolve to no warnings. The id comes from the registry, so the dynamic path is bounded.
async function loadModuleHealth(moduleId: string): Promise<ModuleHealthCheck | null> {
  try {
    const mod = (await import(`../modules/${moduleId}/health`)) as { getHealth?: ModuleHealthCheck };
    return typeof mod.getHealth === "function" ? mod.getHealth : null;
  } catch {
    return null;
  }
}

async function collectModuleWarnings(ctx: ModuleHealthContext): Promise<PlatformWarning[]> {
  const enabledModules = moduleRegistry.filter((module) => isEnabled(ctx.settings, module.id));

  const results = await Promise.all(
    enabledModules.map(async (module) => {
      const getHealth = await loadModuleHealth(module.id);
      if (!getHealth) return [] as PlatformWarning[];

      try {
        return await getHealth(ctx);
      } catch (error) {
        console.error("[platform-status:module-health-failed]", module.id, error);
        return [] as PlatformWarning[];
      }
    })
  );

  return results.flat();
}

// Platform-level checks that are not owned by any single module.
function collectPlatformWarnings(): PlatformWarning[] {
  const warnings: PlatformWarning[] = [];

  if (envLooksDefault(process.env.AUTH_SECRET)) {
    warnings.push(
      warning(
        "AUTH_SECRET should be hardened",
        "Set a production-length AUTH_SECRET before deployment; auth currently falls back to development behavior when unset.",
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

  const [moduleWarnings, platformWarnings] = await Promise.all([
    collectModuleWarnings(ctx),
    Promise.resolve(collectPlatformWarnings())
  ]);
  const warnings = [...moduleWarnings, ...platformWarnings];

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
