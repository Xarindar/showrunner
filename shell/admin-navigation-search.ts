import type { ShellModule } from "./module-types";

export function searchAdminNavigation(modules: Pick<ShellModule, "id" | "label" | "href">[], query: string) {
  const words = query.trim().toLowerCase().split(/\s+/);
  return modules.flatMap(item => {
    const pages = [{ label: item.id === "dashboard" ? "Home" : item.id === "scheduling" ? "Sessions" : item.id === "appointments" ? "Appointments" : item.label, href: item.href }];
    if (item.id === "scheduling") pages.push(
      { label: "Session Bundles", href: "/admin/modules/services/packages" },
      { label: "Categories", href: "/admin/modules/services/categories" }
    );
    if (item.id === "appointments") pages.push(
      { label: "Schedule", href: "/admin/modules/appointments/schedule" },
      { label: "Staff", href: "/admin/modules/appointments/staff" }
    );
    return pages.filter(page => words.every(word => `${item.label} ${page.label}`.toLowerCase().includes(word)));
  });
}
