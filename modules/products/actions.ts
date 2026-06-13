"use server";

import { OrderStatus, PaymentProvider, Prisma, ProductStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  collectionFormSchema,
  collectionProductFormSchema,
  couponFormSchema,
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

function refreshProducts() {
  revalidatePath("/admin");
  revalidatePath("/admin/modules/products");
  revalidatePath("/admin/modules/clients");
  revalidatePath("/cart");
  revalidatePath("/shop");
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
