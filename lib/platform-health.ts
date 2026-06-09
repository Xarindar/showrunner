import "server-only";

import type { SiteSettingsWithModules } from "@/lib/site";
import type { ModuleId } from "@/shell/modules";

export type PlatformWarningSeverity = "critical" | "warning" | "info";

export type PlatformWarning = {
  title: string;
  detail: string;
  severity: PlatformWarningSeverity;
  moduleId?: ModuleId;
  href?: string;
};

// Context handed to each module's getHealth. The aggregator (lib/platform-status.ts) only calls a
// module's check when that module is enabled, so checks can assume enablement.
export type ModuleHealthContext = {
  settings: SiteSettingsWithModules;
  now: Date;
};

export type ModuleHealthCheck = (ctx: ModuleHealthContext) => Promise<PlatformWarning[]>;

export function warning(
  title: string,
  detail: string,
  severity: PlatformWarningSeverity,
  moduleId?: ModuleId,
  href?: string
): PlatformWarning {
  return { title, detail, severity, moduleId, href };
}

export function envLooksDefault(value: string | undefined) {
  return !value || value.startsWith("replace-with-") || value === "dev-secret-change-before-deploying";
}
