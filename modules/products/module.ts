import type { ShellModule } from "@/shell/module-types";

export const manifest = {
  id: "products",
  label: "Products",
  href: "/admin/modules/products",
  icon: "ShoppingBag",
  order: 90,
  description: "Product catalog, variants, collections, and storefront organization.",
  layout: "standard",
  status: "active",
  enabledByDefault: true,
  readiness: {
    level: "partial",
    mode: "mixed",
    summary: "Catalog admin, public storefront/cart, buy-button embed API, and abandoned-cart recovery are live.",
    primaryGap: "Advanced storefront merchandising controls are pending."
  },
  capabilities: [
    { label: "Catalog admin", status: "foundation" },
    { label: "Checkout/storefront", status: "foundation" },
    { label: "Abandoned-cart recovery", status: "live" }
  ],
  adminRoutes: ["/admin/modules/products"],
  publicRoutes: ["/shop", "/shop/[slug]", "/cart", "/api/public/v1/products", "/api/public/v1/checkout"],
  widgetRoutes: ["/embed/v1/buy-button.js"],
  dependencies: ["media", "billing"],
  dataModels: ["Product", "ProductVariant", "Collection", "Cart", "Order", "Payment"],
  permissions: ["products:manage"],
  settingsSections: ["Commerce", "Payments"],
  healthChecks: ["active-products", "checkout-adapter"]
} satisfies ShellModule;
