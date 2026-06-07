import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "scheduling",
  label: "Scheduling",
  href: "/admin/modules/scheduling",
  icon: "CalendarDays",
  order: 50,
  description: "Services, availability, blockouts, and booking rules.",
  layout: "standard",
  status: "active",
  enabledByDefault: true
} satisfies ShellModule;
