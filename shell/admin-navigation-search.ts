import type { ShellModule } from "./module-types";

export function searchAdminNavigation(modules: Pick<ShellModule, "id" | "label" | "href">[], query: string) {
  const words = query.trim().toLowerCase().split(/\s+/);
  return modules.flatMap(item => {
    const pages = [{ label: item.id === "dashboard" ? "Home" : item.id === "scheduling" ? "Session types" : item.label, href: item.href }];
    if (item.id === "scheduling") pages.push(
      { label: "Categories", href: "/admin/modules/services/categories" },
      { label: "Service bundles", href: "/admin/modules/services/packages" }
    );
    return pages.filter(page => words.every(word => `${item.label} ${page.label}`.toLowerCase().includes(word)));
  });
}
