import "server-only";

import { randomBytes } from "crypto";
import {
  CartStatus,
  CouponType,
  GiftCardStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  ProductStatus,
  ProductType
} from "@prisma/client";
import { buildAnalyticsItem } from "@/lib/analytics/ecommerce";
import { recordAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";

const maxIntCents = 2_147_483_647;
const maxCartQuantity = 999;

type CommerceTx = Prisma.TransactionClient;

type RepriceWarning = {
  code: "removed_unavailable" | "quantity_reduced" | "coupon_removed" | "gift_card_removed";
  message: string;
};

type RepriceCartOptions = {
  allowedStatuses?: CartStatus[];
  siteId?: string;
};

type CommerceCheckoutSettings = {
  commerceFreeShippingThresholdCents: number | null;
  commerceShippingEnabled: boolean;
  commerceShippingFlatCents: number;
  commerceTaxAppliesToShipping: boolean;
  commerceTaxEnabled: boolean;
  commerceTaxRateBps: number;
};

function lineTotal(unitPriceCents: number, quantity: number) {
  const total = unitPriceCents * quantity;
  if (total > maxIntCents) throw new Error("Line total is too high.");
  return total;
}

function couponIsUsable(coupon: {
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  redemptionCount: number;
}) {
  const now = new Date();
  if (!coupon.isActive) return false;
  if (coupon.startsAt && coupon.startsAt > now) return false;
  if (coupon.endsAt && coupon.endsAt < now) return false;
  return coupon.maxRedemptions === null || coupon.redemptionCount < coupon.maxRedemptions;
}

function couponDiscountCents(
  coupon: { type: CouponType; amountCents: number | null; percentOff: number | null },
  subtotalCents: number
) {
  if (subtotalCents <= 0) return 0;
  if (coupon.type === CouponType.FIXED) return Math.min(subtotalCents, coupon.amountCents || 0);
  return Math.min(subtotalCents, Math.floor((subtotalCents * (coupon.percentOff || 0)) / 100));
}

function normalizeGiftCardCode(code: string) {
  return code.trim().toUpperCase();
}

function normalizeGiftCardEmail(email?: string) {
  return email?.trim().toLowerCase() || "";
}

function giftCardIsUsable(giftCard: {
  balanceCents: number;
  currency: string;
  expiresAt: Date | null;
  status: GiftCardStatus;
}) {
  if (giftCard.status !== GiftCardStatus.ACTIVE) return false;
  if (giftCard.balanceCents <= 0) return false;
  if (giftCard.expiresAt && giftCard.expiresAt < new Date()) return false;
  return true;
}

async function getCommerceCheckoutSettings(tx: CommerceTx, siteId: string): Promise<CommerceCheckoutSettings> {
  const settings = await tx.siteSettings.findUnique({
    where: { siteId },
    select: {
      commerceFreeShippingThresholdCents: true,
      commerceShippingEnabled: true,
      commerceShippingFlatCents: true,
      commerceTaxAppliesToShipping: true,
      commerceTaxEnabled: true,
      commerceTaxRateBps: true
    }
  });

  return {
    commerceFreeShippingThresholdCents: settings?.commerceFreeShippingThresholdCents ?? null,
    commerceShippingEnabled: settings?.commerceShippingEnabled ?? false,
    commerceShippingFlatCents: settings?.commerceShippingFlatCents ?? 0,
    commerceTaxAppliesToShipping: settings?.commerceTaxAppliesToShipping ?? false,
    commerceTaxEnabled: settings?.commerceTaxEnabled ?? false,
    commerceTaxRateBps: settings?.commerceTaxRateBps ?? 0
  };
}

function calculateCheckoutTotals(input: {
  discountCents: number;
  giftCardBalanceCents: number;
  hasShippableItems: boolean;
  settings: CommerceCheckoutSettings;
  subtotalCents: number;
}) {
  const discountedSubtotalCents = Math.max(0, input.subtotalCents - input.discountCents);
  const freeShippingThresholdCents = input.settings.commerceFreeShippingThresholdCents;
  const freeShipping =
    freeShippingThresholdCents !== null &&
    freeShippingThresholdCents >= 0 &&
    discountedSubtotalCents >= freeShippingThresholdCents;
  const shippingCents =
    input.hasShippableItems &&
    input.settings.commerceShippingEnabled &&
    !freeShipping
      ? Math.max(0, input.settings.commerceShippingFlatCents)
      : 0;
  const taxableCents =
    discountedSubtotalCents + (input.settings.commerceTaxAppliesToShipping ? shippingCents : 0);
  const taxCents =
    input.settings.commerceTaxEnabled && input.settings.commerceTaxRateBps > 0
      ? Math.round((taxableCents * input.settings.commerceTaxRateBps) / 10_000)
      : 0;
  const totalBeforeGiftCardCents = discountedSubtotalCents + shippingCents + taxCents;
  const giftCardCreditCents = Math.min(totalBeforeGiftCardCents, Math.max(0, input.giftCardBalanceCents));
  const totalCents = totalBeforeGiftCardCents - giftCardCreditCents;
  if (totalCents > maxIntCents) throw new Error("Cart total is too high.");

  return {
    giftCardCreditCents,
    shippingCents,
    taxCents,
    totalCents
  };
}

async function generateOrderNumber(tx: CommerceTx, siteId: string) {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `ORD-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const existing = await tx.order.findFirst({
      where: { siteId, orderNumber: candidate },
      select: { id: true }
    });
    if (!existing) return candidate;
  }

  throw new Error("Could not generate a unique order number.");
}

async function resolvePurchasableVariant(
  tx: CommerceTx,
  input: { productId: string; variantId?: string; quantity: number; siteId?: string }
) {
  const siteId = input.siteId || (await getCurrentSiteId());
  const product = await tx.product.findFirst({
    where: { id: input.productId, siteId },
    include: {
      variants: {
        where: input.variantId ? { id: input.variantId } : { isDefault: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        take: 1
      }
    }
  });

  if (!product || product.status !== ProductStatus.ACTIVE) {
    throw new Error("That product is not available.");
  }

  let variant: (typeof product.variants)[number] | null = product.variants[0] || null;
  if (!variant && !input.variantId) {
    variant = await tx.productVariant.findFirst({
      where: { productId: product.id, isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
    });
  }

  if (input.variantId && (!variant || variant.productId !== product.id)) {
    throw new Error("That product option is not available.");
  }

  if (variant && !variant.isActive) {
    throw new Error("That product option is not available.");
  }

  const inventoryAuthority = variant || product;
  if (inventoryAuthority.trackInventory && (inventoryAuthority.inventoryQuantity || 0) < input.quantity) {
    throw new Error("Not enough inventory is available.");
  }

  return {
    product,
    variant,
    unitPriceCents: variant?.priceCents ?? product.basePriceCents,
    currency: product.currency
  };
}

export async function repriceCart(tx: CommerceTx, cartId: string, options: RepriceCartOptions = {}) {
  const allowedStatuses = options.allowedStatuses || [CartStatus.OPEN];
  const siteId = options.siteId || (await getCurrentSiteId());
  const warnings: RepriceWarning[] = [];
  const cart = await tx.cart.findFirst({
    where: { id: cartId, siteId },
    include: {
      coupon: true,
      giftCard: true,
      items: {
        include: { product: true, variant: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!cart) throw new Error("Cart not found.");
  if (!allowedStatuses.includes(cart.status)) throw new Error("This cart is no longer open.");

  let currency = cart.currency || "USD";
  let subtotalCents = 0;
  let discountableSubtotalCents = 0;
  let hasGiftCardItems = false;
  let hasShippableItems = false;

  for (const item of cart.items) {
    const productUnavailable = item.product.status !== ProductStatus.ACTIVE;
    const variantUnavailable = Boolean(item.variantId && (!item.variant || !item.variant.isActive));
    const inventoryAuthority = item.variant || item.product;
    const inventoryQuantity = inventoryAuthority.inventoryQuantity ?? 0;

    if (productUnavailable || variantUnavailable || (inventoryAuthority.trackInventory && inventoryQuantity <= 0)) {
      await tx.cartItem.delete({ where: { id: item.id } });
      warnings.push({ code: "removed_unavailable", message: `${item.product.name} was removed from the cart.` });
      continue;
    }

    const nextQuantity =
      inventoryAuthority.trackInventory && item.quantity > inventoryQuantity ? Math.max(0, inventoryQuantity) : item.quantity;

    if (nextQuantity <= 0) {
      await tx.cartItem.delete({ where: { id: item.id } });
      warnings.push({ code: "removed_unavailable", message: `${item.product.name} was removed from the cart.` });
      continue;
    }

    if (nextQuantity !== item.quantity) {
      warnings.push({ code: "quantity_reduced", message: `${item.product.name} quantity was reduced to available stock.` });
    }

    if (subtotalCents === 0) currency = item.product.currency;
    if (item.product.currency !== currency) throw new Error("A cart can only contain one currency.");
    const isGiftCardItem = item.product.type === ProductType.GIFT_CARD;
    if (isGiftCardItem) hasGiftCardItems = true;
    if (item.product.type === ProductType.PHYSICAL) hasShippableItems = true;

    const unitPriceCents = item.variant?.priceCents ?? item.product.basePriceCents;
    const nextLineTotalCents = lineTotal(unitPriceCents, nextQuantity);
    subtotalCents += nextLineTotalCents;
    if (!isGiftCardItem) discountableSubtotalCents += nextLineTotalCents;
    if (subtotalCents > maxIntCents) throw new Error("Cart subtotal is too high.");

    if (
      item.quantity !== nextQuantity ||
      item.unitPriceCents !== unitPriceCents ||
      item.lineTotalCents !== nextLineTotalCents
    ) {
      await tx.cartItem.update({
        where: { id: item.id },
        data: {
          quantity: nextQuantity,
          unitPriceCents,
          lineTotalCents: nextLineTotalCents
        }
      });
    }
  }

  let couponId = cart.couponId;
  let discountCents = 0;
  if (cart.coupon) {
    if (couponIsUsable(cart.coupon)) {
      discountCents = couponDiscountCents(cart.coupon, discountableSubtotalCents);
      if (discountCents === 0 && discountableSubtotalCents === 0) {
        couponId = null;
        warnings.push({ code: "coupon_removed", message: "Coupons do not apply to gift cards." });
      }
    } else {
      couponId = null;
      warnings.push({ code: "coupon_removed", message: "The coupon is no longer available." });
    }
  }

  let giftCardId = cart.giftCardId;
  let giftCardBalanceCents = 0;
  if (cart.giftCard) {
    if (hasGiftCardItems) {
      giftCardId = null;
      warnings.push({ code: "gift_card_removed", message: "Gift cards cannot be used to buy gift cards." });
    } else if (giftCardIsUsable(cart.giftCard) && cart.giftCard.currency === currency) {
      giftCardBalanceCents = cart.giftCard.balanceCents;
    } else {
      giftCardId = null;
      warnings.push({ code: "gift_card_removed", message: "The gift card is no longer available for this cart." });
    }
  }

  const checkoutSettings = await getCommerceCheckoutSettings(tx, siteId);
  const { giftCardCreditCents, shippingCents, taxCents, totalCents } = calculateCheckoutTotals({
    discountCents,
    giftCardBalanceCents,
    hasShippableItems,
    settings: checkoutSettings,
    subtotalCents
  });
  await tx.cart.update({
    where: { id: cartId },
    data: {
      currency,
      subtotalCents,
      discountCents,
      shippingCents,
      taxCents,
      giftCardCreditCents,
      totalCents,
      couponId,
      giftCardId
    }
  });

  const updatedCart = await tx.cart.findFirst({
    where: { id: cartId, siteId },
    include: {
      coupon: true,
      giftCard: true,
      items: {
        include: { product: true, variant: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!updatedCart) throw new Error("Cart not found.");
  return { cart: updatedCart, warnings };
}

export async function getOpenCart(cartId?: string) {
  if (!cartId) return null;

  const siteId = await getCurrentSiteId();
  return prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { id: cartId, siteId },
      select: { id: true, status: true }
    });

    if (!cart || cart.status !== CartStatus.OPEN) return null;
    return repriceCart(tx, cartId, { siteId });
  });
}

export async function addCartItem(input: {
  cartId?: string;
  giftCardMessage?: string;
  giftCardRecipientEmail?: string;
  giftCardRecipientName?: string;
  productId: string;
  variantId?: string;
  quantity: number;
}) {
  const siteId = await getCurrentSiteId();
  return prisma.$transaction(async (tx) => {
    let quantity = Math.min(Math.max(1, input.quantity), maxCartQuantity);
    const resolved = await resolvePurchasableVariant(tx, {
      productId: input.productId,
      variantId: input.variantId,
      quantity,
      siteId
    });
    const isGiftCardSale = resolved.product.type === ProductType.GIFT_CARD;
    const giftCardRecipientEmail = normalizeGiftCardEmail(input.giftCardRecipientEmail);
    const giftCardRecipientName = input.giftCardRecipientName?.trim() || "";
    const giftCardMessage = input.giftCardMessage?.trim() || "";

    if (isGiftCardSale) {
      quantity = 1;
      if (!giftCardRecipientEmail) {
        throw new Error("Add a recipient email for the gift card.");
      }
    }

    const cart =
      input.cartId
        ? await tx.cart.findFirst({
            where: { id: input.cartId, siteId, status: CartStatus.OPEN },
            include: { items: { include: { product: true } } }
          })
        : null;

    const openCart =
      cart ||
      (await tx.cart.create({
        data: {
          siteId,
          currency: resolved.currency,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
        },
        include: { items: { include: { product: true } } }
      }));

    const existingCurrency = openCart.items[0]?.product.currency || openCart.currency;
    if (openCart.items.length && existingCurrency !== resolved.currency) {
      throw new Error("A cart can only contain one currency.");
    }

    const existing = isGiftCardSale
      ? null
      : await tx.cartItem.findFirst({
          where: {
            cartId: openCart.id,
            productId: resolved.product.id,
            variantId: resolved.variant?.id || null
          }
        });
    const nextQuantity = Math.min((existing?.quantity || 0) + quantity, maxCartQuantity);
    const totalCents = lineTotal(resolved.unitPriceCents, nextQuantity);

    if (existing) {
      await tx.cartItem.update({
        where: { id: existing.id },
        data: {
          quantity: nextQuantity,
          unitPriceCents: resolved.unitPriceCents,
          lineTotalCents: totalCents
        }
      });
    } else {
      await tx.cartItem.create({
        data: {
          cartId: openCart.id,
          productId: resolved.product.id,
          variantId: resolved.variant?.id,
          giftCardMessage,
          giftCardRecipientEmail,
          giftCardRecipientName,
          quantity,
          unitPriceCents: resolved.unitPriceCents,
          lineTotalCents: lineTotal(resolved.unitPriceCents, quantity)
        }
      });
    }

    await repriceCart(tx, openCart.id, { siteId });
    return {
      analyticsItem: buildAnalyticsItem({
        productId: resolved.product.id,
        productName: resolved.product.name,
        quantity,
        unitPriceCents: resolved.unitPriceCents,
        variantName: resolved.variant && !resolved.variant.isDefault ? resolved.variant.name : undefined
      }),
      cartId: openCart.id,
      currency: resolved.currency,
      valueCents: lineTotal(resolved.unitPriceCents, quantity)
    };
  });
}

export async function updateCartItem(input: { cartId: string; itemId: string; quantity: number }) {
  const siteId = await getCurrentSiteId();
  return prisma.$transaction(async (tx) => {
    const item = await tx.cartItem.findFirst({
      where: { id: input.itemId, cartId: input.cartId, cart: { siteId } },
      select: { id: true, unitPriceCents: true }
    });
    if (!item) throw new Error("Cart item not found.");

    const quantity = Math.min(Math.max(0, input.quantity), maxCartQuantity);
    if (quantity === 0) {
      await tx.cartItem.delete({ where: { id: item.id } });
    } else {
      await tx.cartItem.update({
        where: { id: item.id },
        data: {
          quantity,
          lineTotalCents: lineTotal(item.unitPriceCents, quantity)
        }
      });
    }

    await repriceCart(tx, input.cartId, { siteId });
  });
}

export async function applyCartCoupon(input: { cartId: string; code: string }) {
  const siteId = await getCurrentSiteId();
  return prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { id: input.cartId, siteId },
      select: { siteId: true }
    });
    if (!cart) throw new Error("Cart not found.");

    const coupon = await tx.coupon.findUnique({
      where: { siteId_code: { siteId: cart.siteId, code: input.code.trim().toUpperCase() } }
    });

    if (!coupon || !couponIsUsable(coupon)) {
      throw new Error("That coupon is not available.");
    }

    await tx.cart.update({
      where: { id: input.cartId },
      data: { couponId: coupon.id }
    });
    await repriceCart(tx, input.cartId, { siteId });
  });
}

export async function removeCartCoupon(cartId: string) {
  const siteId = await getCurrentSiteId();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.cart.updateMany({ where: { id: cartId, siteId }, data: { couponId: null } });
    if (updated.count !== 1) throw new Error("Cart not found.");
    await repriceCart(tx, cartId, { siteId });
  });
}

export async function applyGiftCardToCart(input: { cartId: string; code: string }) {
  const siteId = await getCurrentSiteId();
  return prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { id: input.cartId, siteId, status: CartStatus.OPEN },
      select: { currency: true, id: true, items: { select: { id: true }, take: 1 } }
    });
    if (!cart) throw new Error("Cart not found.");
    if (!cart.items.length) throw new Error("Add an item before applying a gift card.");

    const giftCard = await tx.giftCard.findUnique({
      where: { siteId_code: { siteId, code: normalizeGiftCardCode(input.code) } }
    });
    if (!giftCard || !giftCardIsUsable(giftCard)) {
      throw new Error("That gift card is not available.");
    }
    if (giftCard.currency !== cart.currency) {
      throw new Error("That gift card uses a different currency.");
    }

    await tx.cart.update({
      where: { id: cart.id },
      data: { giftCardId: giftCard.id }
    });
    await repriceCart(tx, cart.id, { siteId });
  });
}

export async function removeCartGiftCard(cartId: string) {
  const siteId = await getCurrentSiteId();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.cart.updateMany({
      where: { id: cartId, siteId, status: CartStatus.OPEN },
      data: { giftCardCreditCents: 0, giftCardId: null }
    });
    if (updated.count !== 1) throw new Error("Cart not found.");
    await repriceCart(tx, cartId, { siteId });
  });
}

async function findOrCreateOrderClient(
  tx: CommerceTx,
  input: { customerName: string; customerEmail: string; siteId: string }
) {
  const client = await tx.client.upsert({
    where: { siteId_email: { siteId: input.siteId, email: input.customerEmail } },
    update: {},
    create: {
      siteId: input.siteId,
      name: input.customerName,
      email: input.customerEmail,
      status: "active"
    },
    select: { id: true }
  });

  return client.id;
}

export async function createCheckoutOrderFromCart(input: { cartId: string; customerName: string; customerEmail: string }) {
  const siteId = await getCurrentSiteId();
  const result = await prisma.$transaction(async (tx) => {
    const customerEmail = input.customerEmail.trim().toLowerCase();
    const claimedCart = await tx.cart.updateMany({
      where: { id: input.cartId, siteId, status: CartStatus.OPEN },
      data: {
        status: CartStatus.CHECKED_OUT,
        customerEmail
      }
    });

    if (claimedCart.count !== 1) {
      throw new Error("This cart has already been prepared for checkout.");
    }

    const { cart } = await repriceCart(tx, input.cartId, {
      allowedStatuses: [CartStatus.CHECKED_OUT],
      siteId
    });
    if (!cart.items.length) throw new Error("Add at least one item before preparing checkout.");

    let redeemedGiftCard:
      | {
          amountCents: number;
          code: string;
          giftCardId: string;
        }
      | null = null;
    if (cart.giftCardId && cart.giftCardCreditCents > 0) {
      const claimed = await tx.giftCard.updateMany({
        where: {
          id: cart.giftCardId,
          siteId,
          status: GiftCardStatus.ACTIVE,
          balanceCents: { gte: cart.giftCardCreditCents },
          currency: cart.currency,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        },
        data: {
          balanceCents: { decrement: cart.giftCardCreditCents }
        }
      });

      if (claimed.count !== 1) {
        throw new Error("Gift card balance changed. Reload the cart and try again.");
      }

      const giftCard = await tx.giftCard.findUniqueOrThrow({
        where: { id: cart.giftCardId },
        select: { code: true, id: true }
      });
      redeemedGiftCard = {
        amountCents: cart.giftCardCreditCents,
        code: giftCard.code,
        giftCardId: giftCard.id
      };
    }

    const clientId = await findOrCreateOrderClient(tx, {
      customerName: input.customerName,
      customerEmail,
      siteId: cart.siteId
    });
    const orderNumber = await generateOrderNumber(tx, cart.siteId);
    const order = await tx.order.create({
      data: {
        siteId: cart.siteId,
        orderNumber,
        clientId,
        customerName: input.customerName,
        customerEmail,
        status: OrderStatus.PENDING,
        currency: cart.currency,
        subtotalCents: cart.subtotalCents,
        discountCents: cart.discountCents,
        taxCents: cart.taxCents,
        shippingCents: cart.shippingCents,
        giftCardCreditCents: cart.giftCardCreditCents,
        totalCents: cart.totalCents,
        couponId: cart.couponId,
        giftCardId: cart.giftCardId,
        notes: "Order prepared from public cart. Hosted checkout URL and payment webhook confirmation are still pending.",
        placedAt: new Date(),
        items: {
          create: cart.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            name:
              item.variant && !item.variant.isDefault
                ? `${item.product.name} - ${item.variant.name}`
                : item.product.name,
            sku: item.variant?.sku || item.product.sku,
            giftCardMessage: item.giftCardMessage,
            giftCardRecipientEmail: item.giftCardRecipientEmail,
            giftCardRecipientName: item.giftCardRecipientName,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            lineTotalCents: item.lineTotalCents
          }))
        },
        payments: {
          create: {
            provider: cart.totalCents > 0 ? PaymentProvider.STRIPE : PaymentProvider.MANUAL,
            status: PaymentStatus.PENDING,
            amountCents: cart.totalCents,
            currency: cart.currency,
            rawSummary: {
              strategy: cart.totalCents > 0 ? "stripe_checkout" : "gift_card_checkout",
              sourceCartId: cart.id,
              shippingCents: cart.shippingCents,
              taxCents: cart.taxCents,
              giftCardCreditCents: cart.giftCardCreditCents,
              pciScope: "Hosted/tokenized collection only. No raw card data is stored."
            }
          }
        }
      },
      include: {
        coupon: true,
        giftCard: true,
        giftCardRedemptions: true,
        items: { orderBy: { createdAt: "asc" } },
        payments: true
      }
    });

    if (redeemedGiftCard) {
      await tx.giftCardRedemption.create({
        data: {
          amountCents: redeemedGiftCard.amountCents,
          codeSnapshot: redeemedGiftCard.code,
          currency: cart.currency,
          giftCardId: redeemedGiftCard.giftCardId,
          orderId: order.id
        }
      });
    }

    return { order, redeemedGiftCard };
  });

  if (result.redeemedGiftCard) {
    await recordAuditLog({
      action: "gift_card.redeemed",
      actor: null,
      metadata: {
        amountCents: result.redeemedGiftCard.amountCents,
        code: result.redeemedGiftCard.code,
        currency: result.order.currency,
        orderNumber: result.order.orderNumber
      },
      siteId: result.order.siteId,
      targetId: result.redeemedGiftCard.giftCardId,
      targetLabel: result.redeemedGiftCard.code,
      targetType: "gift_card"
    });
  }

  return result.order;
}
