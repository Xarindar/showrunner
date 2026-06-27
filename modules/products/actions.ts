"use server";

import { GiftCardStatus, OrderStatus, PaymentProvider, PaymentStatus, Prisma, ProductStatus, ProductType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { generateGiftCardCode } from "@/lib/commerce/gift-cards";
import {
  collectionFormSchema,
  collectionProductFormSchema,
  currencyCode,
  moneyCents,
  optionalEmailStored,
  optionalStoredText,
  parseForm,
  productFormSchema,
  productStatusFormSchema,
  productUpdateFormSchema,
  productVariantFormSchema,
  requiredText,
  safeExternalHttpsUrl
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

const orderFulfillmentSchema = z.object({
  carrier: optionalStoredText,
  id: requiredText,
  trackingNumber: optionalStoredText
});

const orderFulfillmentExportSchema = z.object({
  exportBatch: optionalStoredText,
  id: requiredText
});

const orderPrintLabHandoffSchema = z.object({
  id: requiredText,
  labName: requiredText,
  notes: optionalStoredText,
  reference: optionalStoredText
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

function refreshProducts() {
  revalidatePath("/admin");
  revalidatePath("/admin/modules/products");
  revalidatePath("/admin/modules/clients");
  revalidatePath("/cart");
  revalidatePath("/shop");
}

function productEditPath(productId: string, params?: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return `/admin/modules/products/${productId}${query ? `?${query}` : ""}`;
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
  revalidatePath(productEditPath(product.id));
  redirect(productEditPath(product.id, { saved: "product" }));
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
  revalidatePath(productEditPath(input.id));
  redirect(productEditPath(input.id, { saved: "product" }));
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
  revalidatePath(productEditPath(input.productId));
  redirect(productEditPath(input.productId, { saved: "variant" }));
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
  revalidatePath(productEditPath(input.productId));
  redirect(productEditPath(input.productId, { saved: "collection-product" }));
}

export async function createGiftCardAction(formData: FormData) {
  const user = await requireAdmin("products:manage");
  const input = await parseForm(giftCardIssueSchema, formData, "/admin/modules/products");
  const siteId = await getCurrentSiteId();
  const code = await generateGiftCardCode(prisma, siteId, input.code);

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

export async function fulfillCommerceOrderAction(formData: FormData) {
  const user = await requireAdmin("products:manage");
  const input = await parseForm(orderFulfillmentSchema, formData, "/admin/modules/products");
  const siteId = await getCurrentSiteId();

  try {
    const order = await prisma.order.findFirst({
      where: { id: input.id, siteId },
      include: {
        items: {
          include: { product: true }
        }
      }
    });

    if (!order) throw new Error("Order not found.");
    if (order.status !== OrderStatus.PAID) {
      throw new Error("Only paid orders can be fulfilled.");
    }
    if (!order.items.some((item) => item.product.type === ProductType.PHYSICAL)) {
      throw new Error("Only orders with physical products can be fulfilled.");
    }

    const fulfilledOrder = await updateOrderStatus({
      actorEmail: user.email || "",
      fulfillmentCarrier: input.carrier,
      fulfillmentTrackingNumber: input.trackingNumber,
      orderId: order.id,
      siteId,
      status: OrderStatus.FULFILLED
    });

    await recordAuditLog({
      action: "order.fulfilled",
      actor: user,
      metadata: {
        carrier: fulfilledOrder.fulfillmentCarrier,
        fulfilledAt: fulfilledOrder.fulfilledAt?.toISOString() || "",
        orderNumber: fulfilledOrder.orderNumber,
        trackingNumber: fulfilledOrder.fulfillmentTrackingNumber
      },
      siteId,
      targetId: fulfilledOrder.id,
      targetLabel: fulfilledOrder.orderNumber,
      targetType: "order"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fulfill that order.";
    redirect(`/admin/modules/products?order=${input.id}&error=${encodeURIComponent(message)}`);
  }

  refreshProducts();
  redirect(`/admin/modules/products?saved=fulfilled&order=${input.id}`);
}

export async function markCommerceOrderFulfillmentExportedAction(formData: FormData) {
  const user = await requireAdmin("products:manage");
  const input = await parseForm(orderFulfillmentExportSchema, formData, "/admin/modules/products");
  const siteId = await getCurrentSiteId();

  try {
    const order = await prisma.order.findFirst({
      where: { id: input.id, siteId },
      include: {
        items: {
          include: { product: true }
        }
      }
    });

    if (!order) throw new Error("Order not found.");
    if (order.status !== OrderStatus.PAID) {
      throw new Error("Only paid physical orders can be marked exported.");
    }
    const physicalItemCount = order.items.filter((item) => item.product.type === ProductType.PHYSICAL).length;
    if (!physicalItemCount) {
      throw new Error("Only orders with physical products can be marked exported.");
    }

    const exportedAt = new Date();
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        fulfillmentExportBatch: input.exportBatch,
        fulfillmentExportedAt: exportedAt
      }
    });

    await recordAuditLog({
      action: "order.fulfillment_exported",
      actor: user,
      metadata: {
        exportBatch: updatedOrder.fulfillmentExportBatch,
        exportedAt: exportedAt.toISOString(),
        orderNumber: order.orderNumber,
        physicalItemCount
      },
      siteId,
      targetId: order.id,
      targetLabel: order.orderNumber,
      targetType: "order"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not mark that order exported.";
    redirect(`/admin/modules/products?order=${input.id}&error=${encodeURIComponent(message)}`);
  }

  refreshProducts();
  redirect(`/admin/modules/products?saved=fulfillment-export&order=${input.id}`);
}

export async function recordCommerceOrderPrintLabHandoffAction(formData: FormData) {
  const user = await requireAdmin("products:manage");
  const input = await parseForm(orderPrintLabHandoffSchema, formData, "/admin/modules/products");
  const siteId = await getCurrentSiteId();

  try {
    const order = await prisma.order.findFirst({
      where: { id: input.id, siteId },
      include: {
        items: {
          include: { product: true }
        }
      }
    });

    if (!order) throw new Error("Order not found.");
    if (order.status !== OrderStatus.PAID && order.status !== OrderStatus.FULFILLED) {
      throw new Error("Only paid or fulfilled physical orders can be handed off to a print lab.");
    }
    const physicalItemCount = order.items.filter((item) => item.product.type === ProductType.PHYSICAL).length;
    if (!physicalItemCount) {
      throw new Error("Only orders with physical products can be handed off to a print lab.");
    }

    const handedOffAt = new Date();
    await prisma.order.update({
      where: { id: order.id },
      data: {
        printLabHandoffAt: handedOffAt,
        printLabName: input.labName,
        printLabNotes: input.notes,
        printLabReference: input.reference
      }
    });

    await recordAuditLog({
      action: "order.print_lab_handoff",
      actor: user,
      metadata: {
        handedOffAt: handedOffAt.toISOString(),
        labName: input.labName,
        orderNumber: order.orderNumber,
        physicalItemCount,
        reference: input.reference
      },
      siteId,
      targetId: order.id,
      targetLabel: order.orderNumber,
      targetType: "order"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not record that print lab handoff.";
    redirect(`/admin/modules/products?order=${input.id}&error=${encodeURIComponent(message)}`);
  }

  refreshProducts();
  redirect(`/admin/modules/products?saved=print-lab&order=${input.id}`);
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
