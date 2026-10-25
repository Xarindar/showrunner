import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "products",
  label: "Products",
  href: "/admin/modules/products",
  icon: "ShoppingBag",
  order: 90,
  navigation: { category: "primary" },
  description: "Product catalog, media, variants, categories, bundles, and storefront organization.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "mixed",
    summary: "Catalog admin, product media, categories, variants, bundles, and abandoned-cart recovery are live.",
    primaryGap: "Public product and checkout APIs are implemented; this checkout does not include a complete hosted storefront."
  },
  capabilities: [
    { label: "Catalog admin", status: "live" },
    { label: "Product media", status: "live" },
    { label: "Categories", status: "live" },
    { label: "Variant options", status: "live" },
    { label: "Bundles", status: "foundation" },
    { label: "Public checkout API", status: "live" },
    { label: "Abandoned-cart recovery", status: "live" }
  ],
  adminRoutes: ["/admin/modules/products", "/admin/modules/products/[productId]"],
  publicRoutes: ["/api/public/v1/products", "/api/public/v1/checkout"],
  dependencies: ["media", "billing"],
  dataModels: ["Product", "ProductVariant", "ProductOption", "ProductMedia", "ProductCategory", "ProductBundleComponent", "Cart", "Order", "Payment"],
  permissions: ["products:manage"],
  settingsSections: ["Commerce", "Payments"],
  healthChecks: ["active-products", "checkout-adapter"]
} satisfies ShellModule;
