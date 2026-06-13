"use server";

import { randomBytes } from "crypto";
import { GiftCardStatus, OrderStatus, PaymentProvider, PaymentStatus, Prisma, ProductStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import {
  collectionFormSchema,
  collectionProductFormSchema,
  couponFormSchema,
  currencyCode,
  moneyCents,
  optionalEmailStored,
  optionalMoneyCents,
  optionalStoredText,
  parseForm,
  productFormSchema,
  productStatusFormSchema,
  productUpdateFormSchema,
  productVariantFormSchema,
  requiredText,
  safeExternalHttpsUrl,
  zeroableMoneyCents
} from "@/lib/admin-validation";
import { updateOrderStatus } from "@/lib/commerce/orders";
import { generateUniqueCommerceSlug } from "@/lib/commerce/slugs";
import { refundPaymentGatewayPayment } from "@/lib/payments/refunds";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId } from "@/lib/site";

const orderStatusFormSchema = z.object({
  id: requiredText,
  status: z.enum(OrderStatus)
});

const orderCheckoutLinkSchema = z.object({
  id: requiredText,
  checkoutUrl: safeExternalHttpsUrl,
  externalCheckoutSession: optionalStoredText
});

const orderCheckoutClearSchema = z.object({
  id: requiredText,
  confirmClear: z.literal("on", { error: "Confirm before clearing the hosted checkout link." })
});

const orderRefundSchema = z.object({
  paymentId: requiredText,
  amount: moneyCents
});

const optionalStoredDate = z
  .string()
  .transform((value) => value.trim())
  .transform((value, context) => {
    if (!value) return undefined;
    const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      context.addIssue({ code: "custom", message: "Use a valid date." });
      return z.NEVER;
    }
    return date;
  });

const giftCardIssueSchema = z.object({
  amount: moneyCents,
  code: optionalStoredText.transform((value) => value.toUpperCase()),
  currency: currencyCode.catch("USD"),
  expiresAt: optionalStoredDate,
  note: optionalStoredText,
  purchaserEmail: optionalEmailStored,
  purchaserName: optionalStoredText,
  recipientEmail: optionalEmailStored,
  recipientName: optionalStoredText
});

const percentRateBps = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value === "" || /^\d+(\.\d{1,2})?$/.test(value), "Use a percentage such as 8.25.")
  .transform((value) => (value === "" ? 0 : Math.round(Number(value) * 100)))
  .refine((value) => value >= 0 && value <= 10_000, "Use a percentage from 0 to 100.");

const commerceCheckoutSettingsSchema = z
  .object({
    commerceTaxEnabled: z.literal("on").optional(),
    commerceTaxLabel: requiredText,
    commerceTaxRate: percentRateBps,
    commerceTaxAppliesToShipping: z.literal("on").optional(),
    commerceShippingEnabled: z.literal("on").optional(),
    commerceShippingLabel: requiredText,
    commerceShippingFlat: zeroableMoneyCents,
    commerceFreeShippingThreshold: optionalMoneyCents
  })
  .transform((value) => ({
    ...value,
    commerceShippingEnabled: value.commerceShippingEnabled === "on",
    commerceTaxAppliesToShipping: value.commerceTaxAppliesToShipping === "on",
    commerceTaxEnabled: value.commerceTaxEnabled === "on"
  }));

function refreshProducts() {
  revalidatePath("/admin");
  revalidatePath("/admin/modules/products");
  revalidatePath("/admin/modules/clients");
  revalidatePath("/cart");
  revalidatePath("/shop");
}

async function generateGiftCardCode(siteId: string, requestedCode?: string) {
  if (requestedCode) return requestedCode;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `GC-${randomGiftCardSegment()}-${randomGiftCardSegment()}`;
    const existing = await prisma.giftCard.findUnique({
      where: { siteId_code: { siteId, code } },
      select: { id: true }
    });
    if (!existing) return code;
  }

  throw new Error("Could not generate a unique gift card code.");
}

function randomGiftCardSegment() {
  return randomBytes(3).toString("hex").slice(0, 4).toUpperCase();
}

async function syncDefaultVariant(
  tx: Prisma.TransactionClient,
  input: {
    productId: string;
    sku: string;
    priceCents: number;
    compareAtPriceCents?: number;
    trackInventory: boolean;
    inventoryQuantity?: number;
    isActive: boolean;
  }
) {
  const defaultVariant = await tx.productVariant.findFirst({
    where: { productId: input.productId, isDefault: true },
    select: { id: true }
  });

  const data = {
    sku: input.sku,
    priceCents: input.priceCents,
    compareAtPriceCents: input.compareAtPriceCents,
    trackInventory: input.trackInventory,
    inventoryQuantity: input.inventoryQuantity,
    isActive: input.isActive
  };

  if (defaultVariant) {
    await tx.productVariant.update({
      where: { id: defaultVariant.id },
      data
    });
    return;
  }

  await tx.productVariant.create({
    data: {
      productId: input.productId,
      name: "Default",
      optionName: "",
      optionValue: "",
      isDefault: true,
      ...data
    }
  });
}

export async function createProductAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(productFormSchema, formData);
  const siteId = await getCurrentSiteId();
  const slug = await generateUniqueCommerceSlug(prisma, "product", {
    name: input.name,
    slug: input.slug || "",
    siteId
  });

  const product = await prisma.product.create({
    data: {
      siteId,
      slug,
      name: input.name,
      summary: input.summary,
      description: input.description,
      type: input.type,
      status: input.status,
      basePriceCents: input.basePrice,
      compareAtPriceCents: input.compareAtPrice,
      currency: input.currency,
      sku: input.sku,
      imageUrl: input.imageUrl,
      tags: input.tags,
      trackInventory: input.trackInventory,
      inventoryQuantity: input.inventoryQuantity,
      variants: {
        create: {
          name: "Default",
          sku: input.sku,
          priceCents: input.basePrice,
          compareAtPriceCents: input.compareAtPrice,
          trackInventory: input.trackInventory,
          inventoryQuantity: input.inventoryQuantity,
          isDefault: true,
          isActive: input.status === ProductStatus.ACTIVE
        }
      }
    }
  });

  refreshProducts();
  redirect(`/admin/modules/products?saved=product&product=${product.id}`);
}

export async function updateProductAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(productUpdateFormSchema, formData);
  const siteId = await getCurrentSiteId();
  const currentProduct = await prisma.product.findFirst({
    where: { id: input.id, siteId },
    select: { siteId: true, slug: true }
  });

  if (!currentProduct) {
    redirect(`/admin/modules/products?error=${encodeURIComponent("Product not found.")}`);
  }

  const slug = input.slug
    ? await generateUniqueCommerceSlug(prisma, "product", {
        name: input.name,
        slug: input.slug,
        siteId,
        exceptId: input.id
      })
    : currentProduct?.slug || (await generateUniqueCommerceSlug(prisma, "product", { name: input.name, siteId, exceptId: input.id }));

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: input.id },
      data: {
        slug,
        name: input.name,
        summary: input.summary,
        description: input.description,
        type: input.type,
        status: input.status,
        basePriceCents: input.basePrice,
        compareAtPriceCents: input.compareAtPrice,
        currency: input.currency,
        sku: input.sku,
        imageUrl: input.imageUrl,
        tags: input.tags,
        trackInventory: input.trackInventory,
        inventoryQuantity: input.inventoryQuantity
      }
    });

    await syncDefaultVariant(tx, {
      productId: input.id,
      sku: input.sku,
      priceCents: input.basePrice,
      compareAtPriceCents: input.compareAtPrice,
      trackInventory: input.trackInventory,
      inventoryQuantity: input.inventoryQuantity,
      isActive: input.status === ProductStatus.ACTIVE
    });
  });

  refreshProducts();
  redirect(`/admin/modules/products?saved=product&product=${input.id}`);
}

export async function updateProductStatusAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(productStatusFormSchema, formData);
  const siteId = await getCurrentSiteId();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.product.updateMany({
      where: { id: input.id, siteId },
      data: { status: input.status }
    });

    if (updated.count !== 1) throw new Error("Product not found.");

    await tx.productVariant.updateMany({
      where: { productId: input.id, isDefault: true },
      data: { isActive: input.status === ProductStatus.ACTIVE }
    });
  });

  refreshProducts();
}

export async function updateCommerceCheckoutSettingsAction(formData: FormData) {
  const user = await requireAdmin("products:manage");
  const input = await parseForm(commerceCheckoutSettingsSchema, formData, "/admin/modules/products");
  const siteId = await getCurrentSiteId();
  const before = await prisma.siteSettings.findUnique({
    where: { siteId },
    select: {
      commerceFreeShippingThresholdCents: true,
      commerceShippingEnabled: true,
      commerceShippingFlatCents: true,
      commerceShippingLabel: true,
      commerceTaxAppliesToShipping: true,
      commerceTaxEnabled: true,
      commerceTaxLabel: true,
      commerceTaxRateBps: true,
      id: true
    }
  });

  if (!before) {
    redirect(`/admin/modules/products?error=${encodeURIComponent("Site settings not found.")}`);
  }

  const after = await prisma.siteSettings.update({
    where: { siteId },
    data: {
      commerceFreeShippingThresholdCents: input.commerceFreeShippingThreshold,
      commerceShippingEnabled: input.commerceShippingEnabled,
      commerceShippingFlatCents: input.commerceShippingFlat,
      commerceShippingLabel: input.commerceShippingLabel,
      commerceTaxAppliesToShipping: input.commerceTaxAppliesToShipping,
      commerceTaxEnabled: input.commerceTaxEnabled,
      commerceTaxLabel: input.commerceTaxLabel,
      commerceTaxRateBps: input.commerceTaxRate
    },
    select: {
      commerceFreeShippingThresholdCents: true,
      commerceShippingEnabled: true,
      commerceShippingFlatCents: true,
      commerceShippingLabel: true,
      commerceTaxAppliesToShipping: true,
      commerceTaxEnabled: true,
      commerceTaxLabel: true,
      commerceTaxRateBps: true,
      id: true
    }
  });

  await recordAuditLog({
    action: "commerce.checkout_settings.updated",
    actor: user,
    metadata: { after, before },
    siteId,
    targetId: after.id,
    targetLabel: "Commerce checkout settings",
    targetType: "site_settings"
  });

  refreshProducts();
  redirect("/admin/modules/products?saved=checkout-settings");
}

export async function createProductVariantAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(productVariantFormSchema, formData);
  const siteId = await getCurrentSiteId();
  const product = await prisma.product.findFirst({
    where: { id: input.productId, siteId },
    select: { id: true }
  });

  if (!product) {
    redirect(`/admin/modules/products?error=${encodeURIComponent("Product not found.")}`);
  }

  if (input.isDefault) {
    await prisma.productVariant.updateMany({
      where: { productId: input.productId },
      data: { isDefault: false }
    });
  }

  await prisma.productVariant.create({
    data: {
      productId: input.productId,
      name: input.name,
      sku: input.sku,
      optionName: input.optionName,
      optionValue: input.optionValue,
      priceCents: input.price,
      compareAtPriceCents: input.compareAtPrice,
      trackInventory: input.trackInventory,
      inventoryQuantity: input.inventoryQuantity,
      isDefault: input.isDefault,
      isActive: input.isActive
    }
  });

  refreshProducts();
  redirect(`/admin/modules/products?saved=variant&product=${input.productId}`);
}

export async function createCollectionAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(collectionFormSchema, formData);
  const siteId = await getCurrentSiteId();
  const slug = await generateUniqueCommerceSlug(prisma, "collection", {
    name: input.name,
    slug: input.slug || "",
    siteId
  });

  await prisma.collection.create({
    data: {
      siteId,
      slug,
      name: input.name,
      description: input.description,
      status: input.status,
      isFeatured: input.isFeatured === "on",
      sortOrder: input.sortOrder
    }
  });

  refreshProducts();
  redirect("/admin/modules/products?saved=collection");
}

export async function addProductToCollectionAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(collectionProductFormSchema, formData);
  const siteId = await getCurrentSiteId();
  const [collection, product] = await Promise.all([
    prisma.collection.findFirst({ where: { id: input.collectionId, siteId }, select: { id: true } }),
    prisma.product.findFirst({ where: { id: input.productId, siteId }, select: { id: true } })
  ]);

  if (!collection || !product) {
    redirect(`/admin/modules/products?error=${encodeURIComponent("Product or collection not found.")}`);
  }

  await prisma.collectionProduct.upsert({
    where: {
      collectionId_productId: {
        collectionId: input.collectionId,
        productId: input.productId
      }
    },
    update: {},
    create: {
      collectionId: input.collectionId,
      productId: input.productId
    }
  });

  refreshProducts();
  redirect(`/admin/modules/products?saved=collection-product&product=${input.productId}`);
}

export async function createCouponAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(couponFormSchema, formData);
  const siteId = await getCurrentSiteId();

  try {
    await prisma.coupon.create({
      data: {
        siteId,
        code: input.code,
        type: input.type,
        amountCents: input.amount,
        percentOff: input.percentOff,
        maxRedemptions: input.maxRedemptions,
        isActive: input.isActive
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`/admin/modules/products?error=${encodeURIComponent(`Coupon ${input.code} already exists.`)}`);
    }

    throw error;
  }

  refreshProducts();
  redirect("/admin/modules/products?saved=coupon");
}

export async function createGiftCardAction(formData: FormData) {
  const user = await requireAdmin("products:manage");
  const input = await parseForm(giftCardIssueSchema, formData, "/admin/modules/products");
  const siteId = await getCurrentSiteId();
  const code = await generateGiftCardCode(siteId, input.code);

  let giftCard: {
    code: string;
    currency: string;
    expiresAt: Date | null;
    id: string;
    initialAmountCents: number;
  };
  try {
    giftCard = await prisma.giftCard.create({
      data: {
        balanceCents: input.amount,
        code,
        currency: input.currency,
        expiresAt: input.expiresAt,
        initialAmountCents: input.amount,
        note: input.note,
        purchaserEmail: input.purchaserEmail,
        purchaserName: input.purchaserName,
        recipientEmail: input.recipientEmail,
        recipientName: input.recipientName,
        siteId,
        status: GiftCardStatus.ACTIVE
      },
      select: {
        code: true,
        currency: true,
        expiresAt: true,
        id: true,
        initialAmountCents: true
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`/admin/modules/products?error=${encodeURIComponent(`Gift card ${code} already exists.`)}`);
    }

    throw error;
  }

  await recordAuditLog({
    action: "gift_card.issued",
    actor: user,
    metadata: {
      amountCents: giftCard.initialAmountCents,
      code: giftCard.code,
      currency: giftCard.currency,
      expiresAt: giftCard.expiresAt?.toISOString() || ""
    },
    siteId,
    targetId: giftCard.id,
    targetLabel: giftCard.code,
    targetType: "gift_card"
  });

  refreshProducts();
  redirect("/admin/modules/products?saved=gift-card");
}

export async function updateCommerceOrderStatusAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(orderStatusFormSchema, formData, "/admin/modules/products");
  const siteId = await getCurrentSiteId();

  try {
    await updateOrderStatus({
      orderId: input.id,
      status: input.status,
      siteId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update that order.";
    redirect(`/admin/modules/products?order=${input.id}&error=${encodeURIComponent(message)}`);
  }

  refreshProducts();
  redirect(`/admin/modules/products?saved=order&order=${input.id}`);
}

export async function setCommerceOrderCheckoutLinkAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(orderCheckoutLinkSchema, formData, "/admin/modules/products");
  const siteId = await getCurrentSiteId();

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: input.id, siteId },
        select: {
          id: true,
          status: true,
          currency: true,
          totalCents: true
        }
      });

      if (!order) throw new Error("Order not found.");
      if (order.status !== OrderStatus.DRAFT && order.status !== OrderStatus.PENDING) {
        throw new Error("Hosted checkout links can only be changed before payment.");
      }

      await tx.order.update({
        where: { id: order.id },
        data: { checkoutUrl: input.checkoutUrl }
      });

      const payment = await tx.payment.findFirst({
        where: { orderId: order.id, provider: PaymentProvider.STRIPE },
        orderBy: { createdAt: "desc" },
        select: { id: true }
      });
      const paymentData = {
        externalCheckoutSession: input.externalCheckoutSession || input.checkoutUrl
      };

      if (payment) {
        await tx.payment.update({
          where: { id: payment.id },
          data: paymentData
        });
      } else {
        await tx.payment.create({
          data: {
            orderId: order.id,
            provider: PaymentProvider.STRIPE,
            amountCents: order.totalCents,
            currency: order.currency,
            ...paymentData
          }
        });
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the hosted checkout link.";
    redirect(`/admin/modules/products?order=${input.id}&error=${encodeURIComponent(message)}`);
  }

  refreshProducts();
  redirect(`/admin/modules/products?saved=checkout&order=${input.id}`);
}

export async function clearCommerceOrderCheckoutLinkAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(orderCheckoutClearSchema, formData, "/admin/modules/products");
  const siteId = await getCurrentSiteId();

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: input.id, siteId },
        select: { id: true, status: true }
      });

      if (!order) throw new Error("Order not found.");
      if (order.status !== OrderStatus.DRAFT && order.status !== OrderStatus.PENDING) {
        throw new Error("Hosted checkout links can only be changed before payment.");
      }

      await tx.order.update({
        where: { id: order.id },
        data: { checkoutUrl: "" }
      });
      await tx.payment.updateMany({
        where: {
          orderId: order.id,
          provider: PaymentProvider.STRIPE
        },
        data: { externalCheckoutSession: "" }
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not clear the hosted checkout link.";
    redirect(`/admin/modules/products?order=${input.id}&error=${encodeURIComponent(message)}`);
  }

  refreshProducts();
  redirect(`/admin/modules/products?saved=checkout-clear&order=${input.id}`);
}

function orderPaymentAuditSnapshot(payment: {
  amountCents: number;
  currency: string;
  externalCheckoutSession: string | null;
  externalPaymentId: string | null;
  id: string;
  provider: PaymentProvider;
  refundedCents: number;
  status: PaymentStatus;
  order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
  };
}) {
  return {
    amountCents: payment.amountCents,
    currency: payment.currency,
    externalCheckoutSession: payment.externalCheckoutSession || "",
    externalPaymentId: payment.externalPaymentId || "",
    orderId: payment.order.id,
    orderNumber: payment.order.orderNumber,
    orderStatus: payment.order.status,
    paymentId: payment.id,
    provider: payment.provider,
    refundedCents: payment.refundedCents,
    remainingRefundableCents: Math.max(0, payment.amountCents - payment.refundedCents),
    status: payment.status
  };
}

async function rollbackCommerceRefundReservation(input: {
  amountCents: number;
  paymentId: string;
  status: PaymentStatus;
}) {
  await prisma.payment.update({
    where: { id: input.paymentId },
    data: {
      refundedCents: { decrement: input.amountCents },
      status: input.status
    }
  });
}

export async function refundCommercePaymentAction(formData: FormData) {
  const user = await requireAdmin("orders:manage");
  const input = await parseForm(orderRefundSchema, formData, "/admin/modules/products");
  const siteId = await getCurrentSiteId();
  let orderId = "";

  try {
    const payment = await prisma.payment.findFirst({
      where: {
        id: input.paymentId,
        order: { siteId }
      },
      include: { order: true }
    });

    if (!payment) throw new Error("Payment not found.");
    orderId = payment.orderId;
    if (payment.status !== PaymentStatus.PAID && payment.status !== PaymentStatus.AUTHORIZED) {
      throw new Error("Only paid payments can be refunded.");
    }

    const remainingCents = Math.max(0, payment.amountCents - payment.refundedCents);
    if (input.amount <= 0 || input.amount > remainingCents) {
      throw new Error("Refund amount must be greater than zero and no more than the refundable balance.");
    }

    const before = orderPaymentAuditSnapshot(payment);
    const reserved = await prisma.payment.updateMany({
      where: {
        id: payment.id,
        order: { siteId },
        status: { in: [PaymentStatus.PAID, PaymentStatus.AUTHORIZED] },
        refundedCents: { lte: payment.amountCents - input.amount }
      },
      data: {
        refundedCents: { increment: input.amount }
      }
    });
    if (reserved.count !== 1) {
      throw new Error("Refund amount is no longer available. Reload and try again.");
    }

    try {
      await refundPaymentGatewayPayment({
        amountCents: input.amount,
        paymentId: payment.id,
        provider: payment.provider,
        siteId
      });
    } catch (refundError) {
      await rollbackCommerceRefundReservation({
        amountCents: input.amount,
        paymentId: payment.id,
        status: payment.status
      });
      throw refundError;
    }

    await prisma.payment.updateMany({
      where: {
        id: payment.id,
        refundedCents: { gte: payment.amountCents },
        status: { in: [PaymentStatus.PAID, PaymentStatus.AUTHORIZED] }
      },
      data: { status: PaymentStatus.REFUNDED }
    });

    const afterPayment = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      include: { order: true }
    });
    const fullyRefunded = afterPayment.refundedCents >= afterPayment.amountCents;

    if (
      fullyRefunded &&
      (afterPayment.order.status === OrderStatus.PAID || afterPayment.order.status === OrderStatus.FULFILLED)
    ) {
      await updateOrderStatus({
        orderId: payment.orderId,
        providerConfirmed: true,
        siteId,
        status: OrderStatus.REFUNDED
      });
    }

    await recordAuditLog({
      action: "order.payment_refunded",
      actor: user,
      metadata: {
        amountCents: input.amount,
        after: orderPaymentAuditSnapshot(afterPayment),
        before,
        currency: payment.currency,
        provider: payment.provider
      },
      siteId,
      targetId: payment.id,
      targetLabel: payment.order.orderNumber,
      targetType: "payment"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not refund that payment.";
    redirect(`/admin/modules/products${orderId ? `?order=${orderId}&` : "?"}error=${encodeURIComponent(message)}`);
  }

  refreshProducts();
  redirect(`/admin/modules/products?saved=refund&order=${orderId}`);
}
