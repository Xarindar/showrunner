import type { AnalyticsEventType, AutomationTrigger } from "@prisma/client";

export type ModuleEventDefinition = {
  analyticsEventName: string;
  analyticsEventType: AnalyticsEventType;
  automationTrigger: AutomationTrigger;
  relatedType: string;
};

// A module contributes its slice of the event catalog as `modules/<id>/events.ts`. Keys are the
// event names that module owns. `lib/events/catalog.ts` merges every slice into the full catalog.
export type ModuleEventSlice = Record<string, ModuleEventDefinition>;
