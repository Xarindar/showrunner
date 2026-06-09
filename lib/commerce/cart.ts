import "server-only";

import { randomBytes } from "crypto";
import {
  CartStatus,
  CouponType,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  ProductStatus
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/site-boundary";

const maxIntCents = 2_147_483_647;
const maxCartQuantity = 999;

type CommerceTx = Prisma.TransactionClient;

type RepriceWarning = {
  code: "removed_unavailable" | "quantity_reduced" | "coupon_removed";
  message: string;
};

type RepriceCartOptions = {
  allowedStatuses?: CartStatus[];
  siteId?: string;
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
  const siteId = input.siteId || DEFAULT_SITE_ID;
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
  const siteId = options.siteId || DEFAULT_SITE_ID;
  const warnings: RepriceWarning[] = [];
  const cart = await tx.cart.findFirst({
    where: { id: cartId, siteId },
    include: {
      coupon: true,
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

    const unitPriceCents = item.variant?.priceCents ?? item.product.basePriceCents;
    const nextLineTotalCents = lineTotal(unitPriceCents, nextQuantity);
    subtotalCents += nextLineTotalCents;
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
      discountCents = couponDiscountCents(cart.coupon, subtotalCents);
    } else {
      couponId = null;
      warnings.push({ code: "coupon_removed", message: "The coupon is no longer available." });
    }
  }

  const totalCents = Math.max(0, subtotalCents - discountCents);
  await tx.cart.update({
    where: { id: cartId },
    data: {
      currency,
      subtotalCents,
      discountCents,
      totalCents,
      couponId
    }
  });

  const updatedCart = await tx.cart.findFirst({
    where: { id: cartId, siteId },
    include: {
      coupon: true,
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

  return prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { id: cartId, siteId: DEFAULT_SITE_ID },
      select: { id: true, status: true }
    });

    if (!cart || cart.status !== CartStatus.OPEN) return null;
    return repriceCart(tx, cartId);
  });
}

export async function addCartItem(input: { cartId?: string; productId: string; variantId?: string; quantity: number }) {
  return prisma.$transaction(async (tx) => {
    const quantity = Math.min(Math.max(1, input.quantity), maxCartQuantity);
    const resolved = await resolvePurchasableVariant(tx, {
      productId: input.productId,
      variantId: input.variantId,
      quantity,
      siteId: DEFAULT_SITE_ID
    });

    const cart =
      input.cartId
        ? await tx.cart.findFirst({
            where: { id: input.cartId, siteId: DEFAULT_SITE_ID, status: CartStatus.OPEN },
            include: { items: { include: { product: true } } }
          })
        : null;

    const openCart =
      cart ||
      (await tx.cart.create({
        data: {
          siteId: DEFAULT_SITE_ID,
          currency: resolved.currency,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
        },
        include: { items: { include: { product: true } } }
      }));

    const existingCurrency = openCart.items[0]?.product.currency || openCart.currency;
    if (openCart.items.length && existingCurrency !== resolved.currency) {
      throw new Error("A cart can only contain one currency.");
    }

    const existing = await tx.cartItem.findFirst({
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
          quantity,
          unitPriceCents: resolved.unitPriceCents,
          lineTotalCents: lineTotal(resolved.unitPriceCents, quantity)
        }
      });
    }

    await repriceCart(tx, openCart.id);
    return openCart.id;
  });
}

export async function updateCartItem(input: { cartId: string; itemId: string; quantity: number }) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.cartItem.findFirst({
      where: { id: input.itemId, cartId: input.cartId },
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

    await repriceCart(tx, input.cartId);
  });
}

export async function applyCartCoupon(input: { cartId: string; code: string }) {
  return prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { id: input.cartId, siteId: DEFAULT_SITE_ID },
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
    await repriceCart(tx, input.cartId);
  });
}

export async function removeCartCoupon(cartId: string) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.cart.updateMany({ where: { id: cartId, siteId: DEFAULT_SITE_ID }, data: { couponId: null } });
    if (updated.count !== 1) throw new Error("Cart not found.");
    await repriceCart(tx, cartId);
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
  return prisma.$transaction(async (tx) => {
    const customerEmail = input.customerEmail.trim().toLowerCase();
    const claimedCart = await tx.cart.updateMany({
      where: { id: input.cartId, siteId: DEFAULT_SITE_ID, status: CartStatus.OPEN },
      data: {
        status: CartStatus.CHECKED_OUT,
        customerEmail
      }
    });

    if (claimedCart.count !== 1) {
      throw new Error("This cart has already been prepared for checkout.");
    }

    const { cart } = await repriceCart(tx, input.cartId, {
      allowedStatuses: [CartStatus.CHECKED_OUT]
    });
    if (!cart.items.length) throw new Error("Add at least one item before preparing checkout.");

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
        taxCents: 0,
        shippingCents: 0,
        totalCents: cart.totalCents,
        couponId: cart.couponId,
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
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            lineTotalCents: item.lineTotalCents
          }))
        },
        payments: {
          create: {
            provider: PaymentProvider.STRIPE,
            status: PaymentStatus.PENDING,
            amountCents: cart.totalCents,
            currency: cart.currency,
            rawSummary: {
              strategy: "stripe_checkout",
              sourceCartId: cart.id,
              pciScope: "Hosted/tokenized collection only. No raw card data is stored."
            }
          }
        }
      },
      include: { payments: true }
    });

    if (cart.couponId) {
      await tx.coupon.update({
        where: { id: cart.couponId },
        data: { redemptionCount: { increment: 1 } }
      });
    }

    return order;
  });
}
