import { appointmentEvents } from "@/modules/appointments/events";
import { automationEvents } from "@/modules/automation/events";
import { billingEvents } from "@/modules/billing/events";
import { clientEvents } from "@/modules/clients/events";
import { formEvents } from "@/modules/forms/events";
import { portfolioEvents } from "@/modules/portfolio/events";
import { productEvents } from "@/modules/products/events";
import type { ModuleEventDefinition } from "@/lib/events/types";

export type { ModuleEventDefinition } from "@/lib/events/types";

// Module-owned event slices, merged into the full catalog. Each event lives in its owning module
// (modules/<id>/events.ts); this file only composes them. Order here sets display order in the
// automation module. To add an event, add it to its module's slice and register the slice below.
export const moduleEventCatalog = {
  ...automationEvents,
  ...appointmentEvents,
  ...formEvents,
  ...portfolioEvents,
  ...clientEvents,
  ...billingEvents,
  ...productEvents
} satisfies Record<string, ModuleEventDefinition>;

export type ModuleEventName = keyof typeof moduleEventCatalog;

export const moduleEventNames = Object.keys(moduleEventCatalog) as ModuleEventName[];

export function isModuleEventName(value: string): value is ModuleEventName {
  return Object.prototype.hasOwnProperty.call(moduleEventCatalog, value);
}
