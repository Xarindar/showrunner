import "server-only";

import { analyticsWidgets } from "@/modules/analytics/widgets";
import { appointmentWidgets } from "@/modules/appointments/widgets";
import { automationWidgets } from "@/modules/automation/widgets";
import { billingWidgets } from "@/modules/billing/widgets";
import { clientWidgets } from "@/modules/clients/widgets";
import { communicationWidgets } from "@/modules/communications/widgets";
import { formWidgets } from "@/modules/forms/widgets";
import { mediaWidgets } from "@/modules/media/widgets";
import { paymentWidgets } from "@/modules/payments/widgets";
import { portfolioWidgets } from "@/modules/portfolio/widgets";
import { productWidgets } from "@/modules/products/widgets";
import { schedulingWidgets } from "@/modules/scheduling/widgets";
import { testimonialWidgets } from "@/modules/testimonials/widgets";
import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";

export const dashboardWidgetDefinitions: DashboardWidgetDefinition[] = [
  ...appointmentWidgets,
  ...clientWidgets,
  ...schedulingWidgets,
  ...mediaWidgets,
  ...formWidgets,
  ...productWidgets,
  ...paymentWidgets,
  ...communicationWidgets,
  ...automationWidgets,
  ...portfolioWidgets,
  ...testimonialWidgets,
  ...billingWidgets,
  ...analyticsWidgets
];

const duplicateIds = dashboardWidgetDefinitions
  .map((widget) => widget.id)
  .filter((id, index, ids) => ids.indexOf(id) !== index);

if (duplicateIds.length) {
  throw new Error(`Duplicate dashboard widget ids: ${Array.from(new Set(duplicateIds)).join(", ")}`);
}
