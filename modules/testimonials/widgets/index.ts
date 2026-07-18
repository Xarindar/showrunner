import type { DashboardWidgetDefinition } from "@/shell/dashboard-widget-types";
import { testimonialInboxWidget } from "./testimonial-inbox";

export const testimonialWidgets = [testimonialInboxWidget] satisfies DashboardWidgetDefinition[];
