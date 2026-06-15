import "server-only";

import { AnalyticsEventType, OrderStatus, ProductStatus, ProductType } from "@prisma/client";
import { z } from "zod";
import { buildBeginCheckoutEvent } from "@/lib/analytics/ecommerce";
import { createCheckoutOrderFromCart, addCartItem } from "@/lib/commerce/cart";
import { updateOrderStatus } from "@/lib/commerce/orders";
import { queueOrderCheckoutEmail } from "@/lib/email";
import { emitAnalyticsEvent, requestAttribution } from "@/lib/events/emit";
import { EmbedRequestError } from "@/lib/embed/gateway";
import { createPaymentCheckoutSessionForOrder } from "@/lib/payments/checkout";
import { prisma } from "@/lib/prisma";

const checkoutSchema = z.object({
  customerEmail: z.email("Add a valid email.").transform((value) => value.trim().toLowerCase()),
  customerName: z.string().trim().min(2, "Add your name."),
  giftCardMessage: z.string().trim().max(500).optional(),
  giftCardRecipientEmail: z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .refine((value) => value === "" || z.email().safeParse(value).success, "Add a valid recipient email.")
    .optional(),
  giftCardRecipientName: z.string().trim().max(120).optional(),
  productId: z.string().trim().optional(),
  productSlug: z.string().trim().optional(),
  quantity: z.coerce.number().int().min(1).max(999).default(1),
  variantId: z.string().trim().optional()
});

function jsonArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function publicVariant(variant: {
  compareAtPriceCents: number | null;
  id: string;
  inventoryQuantity: number | null;
  isActive: boolean;
  isDefault: boolean;
  name: string;
  optionName: string;
  optionValue: string;
  priceCents: number | null;
  sku: string | null;
  trackInventory: boolean;
}) {
  return {
    compareAtPriceCents: variant.compareAtPriceCents,
    id: variant.id,
    inStock: !variant.trackInventory || (variant.inventoryQuantity || 0) > 0,
    isDefault: variant.isDefault,
    name: variant.name,
    optionName: variant.optionName,
    optionValue: variant.optionValue,
    priceCents: variant.priceCents,
    sku: variant.sku
  };
}

export async function listPublicCommerceProducts(siteId: string) {
  const products = await prisma.product.findMany({
    where: { siteId, status: ProductStatus.ACTIVE },
    include: {
      variants: {
        where: { isActive: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
      }
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
  });

  return products.map((product) => ({
    basePriceCents: product.basePriceCents,
    compareAtPriceCents: product.compareAtPriceCents,
    currency: product.currency,
    description: product.description,
    id: product.id,
    imageUrl: product.imageUrl,
    inStock: !product.trackInventory || (product.inventoryQuantity || 0) > 0,
    sku: product.sku,
    slug: product.slug,
    summary: product.summary,
    tags: jsonArray(product.tags),
    type: product.type,
    name: product.name,
    variants: product.variants.map(publicVariant)
  }));
}

async function resolveCheckoutProduct(input: { productId?: string; productSlug?: string; siteId: string }) {
  if (!input.productId && !input.productSlug) throw new EmbedRequestError("Choose a product.", 400);

  const product = await prisma.product.findFirst({
    where: {
      siteId: input.siteId,
      status: ProductStatus.ACTIVE,
      ...(input.productId ? { id: input.productId } : { slug: input.productSlug })
    },
    select: { id: true, type: true }
  });

  if (!product) throw new EmbedRequestError("That product is not available.", 404);
  return product;
}

export async function createPublicCommerceCheckout(input: {
  body: unknown;
  searchParams: Record<string, string | string[] | undefined>;
  siteId: string;
}) {
  const parsed = checkoutSchema.safeParse(input.body);
  if (!parsed.success) throw new EmbedRequestError(parsed.error.issues[0]?.message || "Invalid checkout request.", 400);

  try {
    const product = await resolveCheckoutProduct({
      productId: parsed.data.productId,
      productSlug: parsed.data.productSlug,
      siteId: input.siteId
    });
    const isGiftCardSale = product.type === ProductType.GIFT_CARD;
    const cartResult = await addCartItem({
      giftCardMessage: parsed.data.giftCardMessage,
      giftCardRecipientEmail: parsed.data.giftCardRecipientEmail,
      giftCardRecipientName: parsed.data.giftCardRecipientName,
      productId: product.id,
      quantity: parsed.data.quantity,
      siteId: input.siteId,
      variantId: parsed.data.variantId
    });
    const order = await createCheckoutOrderFromCart({
      cartId: cartResult.cartId,
      customerEmail: parsed.data.customerEmail,
      customerName: parsed.data.customerName,
      siteId: input.siteId
    });

    await emitAnalyticsEvent({
      ...(await requestAttribution(input.searchParams, "/api/public/v1/checkout")),
      currency: order.currency,
      eventName: "begin_checkout",
      eventType: AnalyticsEventType.BEGIN_CHECKOUT,
      metadata: buildBeginCheckoutEvent({
        currency: order.currency,
        items: order.items.map((item) => ({
          item_id: item.productId,
          item_name: item.name,
          price: Number((item.unitPriceCents / 100).toFixed(2)),
          quantity: item.quantity
        })),
        totalCents: order.totalCents
      }),
      relatedId: order.id,
      relatedType: "order",
      siteId: input.siteId,
      valueCents: order.totalCents
    });

    if (order.totalCents <= 0) {
      await updateOrderStatus({ orderId: order.id, providerConfirmed: true, siteId: input.siteId, status: OrderStatus.PAID });
      return {
        checkout: {
          checkoutUrl: "",
          currency: order.currency,
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: OrderStatus.PAID,
          totalCents: order.totalCents
        }
      };
    }

    const checkoutOrder = await createPaymentCheckoutSessionForOrder({ orderId: order.id, siteId: input.siteId });
    await queueOrderCheckoutEmail(checkoutOrder);
    if (!checkoutOrder.checkoutUrl) throw new EmbedRequestError("Hosted checkout is not available.", 502);

    return {
      checkout: {
        checkoutUrl: checkoutOrder.checkoutUrl,
        currency: checkoutOrder.currency,
        orderId: checkoutOrder.id,
        orderNumber: checkoutOrder.orderNumber,
        pciScope: "SAQ-A hosted checkout handoff; no raw card data is collected by the embed.",
        productType: isGiftCardSale ? ProductType.GIFT_CARD : product.type,
        status: checkoutOrder.status,
        totalCents: checkoutOrder.totalCents
      }
    };
  } catch (error) {
    if (error instanceof EmbedRequestError) throw error;
    throw new EmbedRequestError(error instanceof Error ? error.message : "Could not prepare checkout.", 400);
  }
}
