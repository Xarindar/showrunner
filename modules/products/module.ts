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
    level: "partial",
    mode: "mixed",
    summary: "Catalog admin, public storefront/cart, order creation, hosted checkout handoff records, and abandoned-cart recovery are live.",
    primaryGap: "Automatic Stripe session creation, payment webhooks, shipping/tax, refunds, and fulfillment exports are pending."
  },
  capabilities: [
    { label: "Catalog admin", status: "foundation" },
    { label: "Coupon admin", status: "foundation" },
    { label: "Checkout/storefront", status: "foundation" },
    { label: "Abandoned-cart recovery", status: "live" },
    { label: "Order dashboard", status: "foundation" }
  ],
  adminRoutes: ["/admin/modules/products"],
  publicRoutes: ["/shop", "/shop/[slug]", "/cart"],
  widgetRoutes: [],
  dependencies: ["media", "billing"],
  dataModels: ["Product", "ProductVariant", "Collection", "Coupon", "Cart", "Order", "Payment"],
  permissions: ["products:manage"],
  settingsSections: ["Commerce", "Payments"],
  healthChecks: ["active-products", "checkout-adapter"]
} satisfies ShellModule;
