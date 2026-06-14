export type AnalyticsEcommerceEventName = "view_item" | "add_to_cart" | "begin_checkout" | "purchase";

export type AnalyticsEcommerceItem = {
  item_id: string;
  item_name: string;
  item_variant?: string;
  item_category?: string;
  item_category2?: string;
  price: number;
  quantity: number;
};

export type AnalyticsEcommerceEvent = {
  eventName: AnalyticsEcommerceEventName;
  currency: string;
  value: number;
  items: AnalyticsEcommerceItem[];
  coupon?: string;
  transaction_id?: string;
};

type AnalyticsItemInput = {
  productId: string;
  productName: string;
  variantName?: string | null;
  categories?: string[];
  quantity: number;
  unitPriceCents: number;
};

export function moneyFromCents(cents: number) {
  return Number((cents / 100).toFixed(2));
}

export function buildAnalyticsItem(input: AnalyticsItemInput): AnalyticsEcommerceItem {
  const categories = (input.categories || []).map((value) => value.trim()).filter(Boolean);

  return {
    item_category: categories[0],
    item_category2: categories[1],
    item_id: input.productId,
    item_name: input.productName,
    item_variant: input.variantName?.trim() || undefined,
    price: moneyFromCents(input.unitPriceCents),
    quantity: Math.max(1, input.quantity)
  };
}

export function buildViewItemEvent(input: {
  categories?: string[];
  currency: string;
  productId: string;
  productName: string;
  unitPriceCents: number;
  variantName?: string | null;
}) {
  const item = buildAnalyticsItem({
    categories: input.categories,
    productId: input.productId,
    productName: input.productName,
    quantity: 1,
    unitPriceCents: input.unitPriceCents,
    variantName: input.variantName
  });

  return {
    currency: input.currency,
    eventName: "view_item" as const,
    items: [item],
    value: item.price
  };
}

export function buildAddToCartEvent(input: {
  categories?: string[];
  currency: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  variantName?: string | null;
}) {
  const item = buildAnalyticsItem(input);

  return {
    currency: input.currency,
    eventName: "add_to_cart" as const,
    items: [item],
    value: Number((item.price * item.quantity).toFixed(2))
  };
}

export function buildBeginCheckoutEvent(input: {
  coupon?: string;
  currency: string;
  items: AnalyticsEcommerceItem[];
  totalCents: number;
}) {
  return {
    coupon: input.coupon,
    currency: input.currency,
    eventName: "begin_checkout" as const,
    items: input.items,
    value: moneyFromCents(input.totalCents)
  };
}

export function buildPurchaseEvent(input: {
  coupon?: string;
  currency: string;
  items: AnalyticsEcommerceItem[];
  totalCents: number;
  transactionId: string;
}) {
  return {
    coupon: input.coupon,
    currency: input.currency,
    eventName: "purchase" as const,
    items: input.items,
    transaction_id: input.transactionId,
    value: moneyFromCents(input.totalCents)
  };
}
