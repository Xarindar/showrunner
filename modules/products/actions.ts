"use server";

import { Prisma, ProductStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  collectionFormSchema,
  collectionProductFormSchema,
  couponFormSchema,
  parseForm,
  productFormSchema,
  productStatusFormSchema,
  productUpdateFormSchema,
  productVariantFormSchema
} from "@/lib/admin-validation";
import { generateUniqueCommerceSlug } from "@/lib/commerce/slugs";
import { prisma } from "@/lib/prisma";

function refreshProducts() {
  revalidatePath("/admin");
  revalidatePath("/admin/modules/products");
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
  await requireAdmin();
  const input = await parseForm(productFormSchema, formData);
  const slug = await generateUniqueCommerceSlug(prisma, "product", {
    name: input.name,
    slug: input.slug || ""
  });

  const product = await prisma.product.create({
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
  await requireAdmin();
  const input = await parseForm(productUpdateFormSchema, formData);
  const currentProduct = await prisma.product.findUnique({
    where: { id: input.id },
    select: { slug: true }
  });
  const slug = input.slug
    ? await generateUniqueCommerceSlug(prisma, "product", {
        name: input.name,
        slug: input.slug,
        exceptId: input.id
      })
    : currentProduct?.slug || (await generateUniqueCommerceSlug(prisma, "product", { name: input.name, exceptId: input.id }));

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
  await requireAdmin();
  const input = await parseForm(productStatusFormSchema, formData);

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: input.id },
      data: { status: input.status }
    });

    await tx.productVariant.updateMany({
      where: { productId: input.id, isDefault: true },
      data: { isActive: input.status === ProductStatus.ACTIVE }
    });
  });

  refreshProducts();
}

export async function createProductVariantAction(formData: FormData) {
  await requireAdmin();
  const input = await parseForm(productVariantFormSchema, formData);

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
  await requireAdmin();
  const input = await parseForm(collectionFormSchema, formData);
  const slug = await generateUniqueCommerceSlug(prisma, "collection", {
    name: input.name,
    slug: input.slug || ""
  });

  await prisma.collection.create({
    data: {
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
  await requireAdmin();
  const input = await parseForm(collectionProductFormSchema, formData);

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
  await requireAdmin();
  const input = await parseForm(couponFormSchema, formData);

  try {
    await prisma.coupon.create({
      data: {
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
