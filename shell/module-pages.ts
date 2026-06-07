import AnalyticsPage from "@/modules/analytics/page";
import AppointmentsPage from "@/modules/appointments/page";
import AutomationPage from "@/modules/automation/page";
import BillingPage from "@/modules/billing/page";
import ClientsPage from "@/modules/clients/page";
import CommunicationsPage from "@/modules/communications/page";
import ContentPage from "@/modules/content/page";
import DashboardPage from "@/modules/dashboard/page";
import FormsPage from "@/modules/forms/page";
import HelpPage from "@/modules/help/page";
import MediaPage from "@/modules/media/page";
import PortfolioPage from "@/modules/portfolio/page";
import ProductsPage from "@/modules/products/page";
import SchedulingPage from "@/modules/scheduling/page";
import SettingsPage from "@/modules/settings/page";
import TestimonialsPage from "@/modules/testimonials/page";
import type { ModulePageComponent } from "@/shell/module-types";

export const modulePages: Record<string, ModulePageComponent> = {
  analytics: AnalyticsPage,
  appointments: AppointmentsPage,
  automation: AutomationPage,
  billing: BillingPage,
  clients: ClientsPage,
  communications: CommunicationsPage,
  content: ContentPage,
  dashboard: DashboardPage,
  forms: FormsPage,
  help: HelpPage,
  media: MediaPage,
  portfolio: PortfolioPage,
  products: ProductsPage,
  scheduling: SchedulingPage,
  settings: SettingsPage,
  testimonials: TestimonialsPage
};
