import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "products",
  label: "Products",
  href: "/admin/modules/products",
  icon: "ShoppingBag",
  order: 90,
  description: "Product catalog, variants, collections, and commerce setup.",
  layout: "standard",
  status: "active",
  enabledByDefault: true
} satisfies ShellModule;
