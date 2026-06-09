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
  enabledByDefault: true,
  readiness: {
    level: "admin-foundation",
    mode: "admin-only",
    summary: "Catalog admin for products, variants, collections, and coupons is live.",
    primaryGap: "Cart, order creation, hosted checkout, payment webhooks, fulfillment, and storefront routes are pending."
  },
  capabilities: [
    { label: "Catalog admin", status: "foundation" },
    { label: "Coupon admin", status: "foundation" },
    { label: "Checkout/storefront", status: "planned" }
  ],
  adminRoutes: ["/admin/modules/products"],
  publicRoutes: [],
  widgetRoutes: [],
  dependencies: ["media", "billing"],
  dataModels: ["Product", "ProductVariant", "Collection", "Coupon", "Cart", "Order", "Payment"],
  permissions: ["products.read", "products.write"],
  settingsSections: ["Commerce", "Payments"],
  healthChecks: ["active-products", "checkout-adapter"]
} satisfies ShellModule;
