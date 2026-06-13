"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AnalyticsEventType, CartStatus, OrderStatus } from "@prisma/client";
import { z } from "zod";
import { buildAddToCartEvent, buildBeginCheckoutEvent } from "@/lib/analytics/ecommerce";
import {
  addCartItem,
  applyGiftCardToCart,
  applyCartCoupon,
  createCheckoutOrderFromCart,
  removeCartGiftCard,
  removeCartCoupon,
  updateCartItem
} from "@/lib/commerce/cart";
import { updateOrderStatus } from "@/lib/commerce/orders";
import { queueOrderCheckoutEmail } from "@/lib/email";
import { subscribeToList } from "@/lib/email/subscriptions";
import { emitAnalyticsEvent, requestAttribution } from "@/lib/events/emit";
import { createPaymentCheckoutSessionForOrder } from "@/lib/payments/checkout";
import { prisma } from "@/lib/prisma";
import { publicRateLimitMessage } from "@/lib/public-rate-limit";
import { getSiteSettings } from "@/lib/site";

const cartCookieName = "commerce_cart_id";

const addToCartSchema = z.object({
  productId: z.string().trim().min(1),
  variantId: z.string().trim().optional(),
  quantity: z.coerce.number().int().min(1).max(999),
  returnTo: z.string().trim().optional()
});

const updateCartItemSchema = z.object({
  itemId: z.string().trim().min(1),
  quantity: z.coerce.number().int().min(0).max(999)
});

const couponSchema = z.object({
  code: z.string().trim().min(1)
});

const giftCardSchema = z.object({
  code: z.string().trim().min(1)
});

const draftOrderSchema = z.object({
  customerName: z.string().trim().min(2, "Add your name."),
  customerEmail: z.email("Add a valid email.").transform((value) => value.trim().toLowerCase())
});

const cartRecoverySignupSchema = z.object({
  customerName: z.string().trim().optional(),
  customerEmail: z.email("Add a valid email.").transform((value) => value.trim().toLowerCase()),
  marketingConsent: z.union([z.literal("on"), z.literal("true")], {
    error: "Agree to receive the cart reminder before saving your cart."
  })
});

async function currentCartId() {
  const cookieStore = await cookies();
  return cookieStore.get(cartCookieName)?.value;
}

async function setCartId(cartId: string) {
  const cookieStore = await cookies();
  cookieStore.set(cartCookieName, cartId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14
  });
}

async function clearCartId() {
  const cookieStore = await cookies();
  cookieStore.delete(cartCookieName);
}

function cartError(message: string): never {
  redirect(`/cart?error=${encodeURIComponent(message)}`);
}

async function requirePublicProductsModule() {
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("products")) {
    cartError("Storefront is not available.");
  }
}

export async function addToCartAction(formData: FormData) {
  await requirePublicProductsModule();

  const parsed = addToCartSchema.safeParse({
    productId: formData.get("productId"),
    variantId: formData.get("variantId") || undefined,
    quantity: formData.get("quantity"),
    returnTo: formData.get("returnTo") || undefined
  });

  if (!parsed.success) {
    cartError(parsed.error.issues[0]?.message || "Could not add that item.");
  }

  try {
    const cart = await addCartItem({
      cartId: await currentCartId(),
      productId: parsed.data.productId,
      variantId: parsed.data.variantId,
      quantity: parsed.data.quantity
    });
    await emitAnalyticsEvent({
      ...(await requestAttribution(undefined, parsed.data.returnTo || "/cart")),
      currency: cart.currency,
      dedupeWindowMinutes: 0,
      eventName: "add_to_cart",
      eventType: AnalyticsEventType.ADD_TO_CART,
      metadata: buildAddToCartEvent({
        currency: cart.currency,
        productId: cart.analyticsItem.item_id,
        productName: cart.analyticsItem.item_name,
        quantity: cart.analyticsItem.quantity,
        unitPriceCents: cart.valueCents / cart.analyticsItem.quantity,
        variantName: cart.analyticsItem.item_variant
      }),
      relatedId: parsed.data.productId,
      relatedType: "product",
      valueCents: cart.valueCents
    });
    await setCartId(cart.cartId);
  } catch (error) {
    cartError(error instanceof Error ? error.message : "Could not add that item.");
  }

  redirect(parsed.data.returnTo || "/cart?added=1");
}

export async function updatePublicCartItemAction(formData: FormData) {
  await requirePublicProductsModule();

  const cartId = await currentCartId();
  if (!cartId) cartError("Cart not found.");

  const parsed = updateCartItemSchema.safeParse({
    itemId: formData.get("itemId"),
    quantity: formData.get("quantity")
  });

  if (!parsed.success) {
    cartError(parsed.error.issues[0]?.message || "Could not update that item.");
  }

  try {
    await updateCartItem({
      cartId,
      itemId: parsed.data.itemId,
      quantity: parsed.data.quantity
    });
  } catch (error) {
    cartError(error instanceof Error ? error.message : "Could not update that item.");
  }

  redirect("/cart?saved=1");
}

export async function applyPublicCartCouponAction(formData: FormData) {
  await requirePublicProductsModule();

  const cartId = await currentCartId();
  if (!cartId) cartError("Cart not found.");

  const parsed = couponSchema.safeParse({
    code: formData.get("code")
  });

  if (!parsed.success) {
    cartError(parsed.error.issues[0]?.message || "Add a coupon code.");
  }

  try {
    await applyCartCoupon({ cartId, code: parsed.data.code });
  } catch (error) {
    cartError(error instanceof Error ? error.message : "Could not apply that coupon.");
  }

  redirect("/cart?saved=coupon");
}

export async function removePublicCartCouponAction(_formData: FormData) {
  void _formData;
  await requirePublicProductsModule();

  const cartId = await currentCartId();
  if (!cartId) cartError("Cart not found.");

  try {
    await removeCartCoupon(cartId);
  } catch (error) {
    cartError(error instanceof Error ? error.message : "Could not remove that coupon.");
  }

  redirect("/cart?saved=coupon-removed");
}

export async function applyPublicGiftCardAction(formData: FormData) {
  await requirePublicProductsModule();

  const cartId = await currentCartId();
  if (!cartId) cartError("Cart not found.");

  const parsed = giftCardSchema.safeParse({
    code: formData.get("code")
  });

  if (!parsed.success) {
    cartError(parsed.error.issues[0]?.message || "Add a gift card code.");
  }

  try {
    await applyGiftCardToCart({ cartId, code: parsed.data.code });
  } catch (error) {
    cartError(error instanceof Error ? error.message : "Could not apply that gift card.");
  }

  redirect("/cart?saved=gift-card");
}

export async function removePublicGiftCardAction(_formData: FormData) {
  void _formData;
  await requirePublicProductsModule();

  const cartId = await currentCartId();
  if (!cartId) cartError("Cart not found.");

  try {
    await removeCartGiftCard(cartId);
  } catch (error) {
    cartError(error instanceof Error ? error.message : "Could not remove that gift card.");
  }

  redirect("/cart?saved=gift-card-removed");
}

export async function saveCartForRecoveryAction(formData: FormData) {
  await requirePublicProductsModule();

  const cartId = await currentCartId();
  if (!cartId) cartError("Cart not found.");

  const parsed = cartRecoverySignupSchema.safeParse({
    customerName: formData.get("customerName") || undefined,
    customerEmail: formData.get("customerEmail"),
    marketingConsent: formData.get("marketingConsent")
  });

  if (!parsed.success) {
    cartError(parsed.error.issues[0]?.message || "Add your email to save this cart.");
  }

  const rateLimitMessage = await publicRateLimitMessage("cart_recovery_signup", { limit: 4, windowMinutes: 10 });
  if (rateLimitMessage) {
    cartError(rateLimitMessage);
  }

  try {
    const settings = await getSiteSettings();
    const client = await prisma.client.upsert({
      where: { siteId_email: { siteId: settings.siteId, email: parsed.data.customerEmail } },
      update: {
        name: parsed.data.customerName || undefined
      },
      create: {
        siteId: settings.siteId,
        email: parsed.data.customerEmail,
        name: parsed.data.customerName || parsed.data.customerEmail,
        status: "lead"
      },
      select: { id: true }
    });

    const updated = await prisma.cart.updateMany({
      where: {
        id: cartId,
        siteId: settings.siteId,
        status: CartStatus.OPEN,
        items: { some: {} }
      },
      data: {
        clientId: client.id,
        customerEmail: parsed.data.customerEmail,
        recoveryLastError: ""
      }
    });

    if (updated.count !== 1) {
      cartError("Cart not found.");
    }

    await subscribeToList({
      siteId: settings.siteId,
      email: parsed.data.customerEmail,
      name: parsed.data.customerName,
      clientId: client.id,
      consentSource: "cart_recovery_signup",
      skipDefaultList: true
    });
  } catch (error) {
    cartError(error instanceof Error ? error.message : "Could not save that cart.");
  }

  redirect("/cart?saved=recovery");
}

export async function preparePublicCheckoutAction(formData: FormData) {
  await requirePublicProductsModule();

  const cartId = await currentCartId();
  if (!cartId) cartError("Cart not found.");

  const parsed = draftOrderSchema.safeParse({
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail")
  });

  if (!parsed.success) {
    cartError(parsed.error.issues[0]?.message || "Add your checkout details.");
  }

  const rateLimitMessage = await publicRateLimitMessage("checkout_prepare", { limit: 6, windowMinutes: 10 });
  if (rateLimitMessage) {
    cartError(rateLimitMessage);
  }

  let checkoutUrl = "";
  let completedOrderNumber = "";

  try {
    const order = await createCheckoutOrderFromCart({
      cartId,
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail
    });
    await emitAnalyticsEvent({
      ...(await requestAttribution(undefined, "/cart")),
      currency: order.currency,
      eventName: "begin_checkout",
      eventType: AnalyticsEventType.BEGIN_CHECKOUT,
      metadata: buildBeginCheckoutEvent({
        coupon: order.coupon?.code || undefined,
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
      valueCents: order.totalCents
    });
    if (order.totalCents <= 0) {
      await updateOrderStatus({
        orderId: order.id,
        providerConfirmed: true,
        siteId: order.siteId,
        status: OrderStatus.PAID
      });
      await clearCartId();
      completedOrderNumber = order.orderNumber;
    } else {
      const checkoutOrder = await createPaymentCheckoutSessionForOrder({ orderId: order.id, siteId: order.siteId });

      await queueOrderCheckoutEmail(checkoutOrder);
      await clearCartId();
      checkoutUrl = checkoutOrder.checkoutUrl || "";
    }
  } catch (error) {
    cartError(error instanceof Error ? error.message : "Could not prepare checkout.");
  }

  if (completedOrderNumber) {
    redirect(`/cart?checkout=success&order=${encodeURIComponent(completedOrderNumber)}`);
  }

  if (!checkoutUrl) {
    cartError("Stripe did not return a hosted checkout URL.");
  }

  redirect(checkoutUrl);
}
