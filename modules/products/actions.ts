"use server";

import { GiftCardStatus, MediaVariantType, OrderStatus, PaymentProvider, PaymentStatus, Prisma, ProductMediaRole, ProductStatus, ProductType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { generateGiftCardCode } from "@/lib/commerce/gift-cards";
import {
  currencyCode,
  moneyCents,
  optionalEmailStored,
  optionalId,
  optionalMoneyCents,
  optionalNonNegativeInt,
  optionalStoredText,
  parseForm,
  productFormSchema,
  productQuickCreateFormSchema,
  productStatusFormSchema,
  productUpdateFormSchema,
  productVariantFormSchema,
  requiredText,
  safeExternalHttpsUrl
} from "@/lib/admin-validation";
import { updateOrderStatus } from "@/lib/commerce/orders";
import { generateUniqueCommerceSlug } from "@/lib/commerce/slugs";
import { mediaAssetDisplayUrl, uploadMedia } from "@/lib/media";
import { refundPaymentGatewayPayment } from "@/lib/payments/refunds";
import { prisma } from "@/lib/prisma";
import { getCurrentSiteId, getSiteSettings } from "@/lib/site";

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

const productMediaUploadSchema = z.object({
  productId: requiredText,
  alt: optionalStoredText,
  previewMedia: z.preprocess((value) => (typeof value === "string" ? value.trim() : ""), z.string()),
  returnTab: z.preprocess((value) => (value === "details" ? "details" : "media"), z.enum(["details", "media"])),
  role: z.enum(ProductMediaRole).catch(ProductMediaRole.GALLERY)
});

const productMediaAttachSchema = productMediaUploadSchema.extend({
  mediaAssetId: requiredText
});

const productMediaSelectSchema = z.object({
  id: requiredText,
  previewMedia: z.preprocess((value) => (typeof value === "string" ? value.trim() : ""), z.string()),
  productId: requiredText,
  returnTab: z.preprocess((value) => (value === "details" ? "details" : "media"), z.enum(["details", "media"]))
});

const productCategoryFormSchema = z.object({
  name: requiredText,
  slug: optionalStoredText,
  parentId: optionalId,
  description: optionalStoredText,
  status: z.enum(ProductStatus).catch(ProductStatus.DRAFT),
  isFeatured: z.literal("on").optional(),
  sortOrder: z.coerce.number().int().default(0)
});

const productCategoryAssignmentFormSchema = z.object({
  categoryId: requiredText,
  productId: requiredText
});

const productCategoryAssignmentDeleteSchema = z.object({
  id: requiredText,
  productId: requiredText
});

const productOptionFormSchema = z.object({
  productId: requiredText,
  name: requiredText,
  values: optionalStoredText,
  sortOrder: z.coerce.number().int().default(0)
});

const productVariantMatrixSchema = z.object({
  productId: requiredText
});

const productVariantUpdateSchema = z
  .object({
    id: requiredText,
    productId: requiredText,
    name: requiredText,
    sku: optionalStoredText,
    price: optionalMoneyCents,
    compareAtPrice: optionalMoneyCents,
    trackInventory: z.literal("on").optional(),
    inventoryQuantity: optionalNonNegativeInt,
    isDefault: z.literal("on").optional(),
    isActive: z.literal("on").optional(),
    sortOrder: z.coerce.number().int().default(0)
  })
  .transform((value) => ({
    ...value,
    trackInventory: value.trackInventory === "on",
    inventoryQuantity: value.trackInventory === "on" ? value.inventoryQuantity ?? 0 : undefined,
    isDefault: value.isDefault === "on",
    isActive: value.isActive === "on"
  }));

const bundleComponentFormSchema = z.object({
  productId: requiredText,
  componentProductId: requiredText,
  componentVariantId: optionalId,
  quantity: z.coerce.number().int().min(1).max(999),
  sortOrder: z.coerce.number().int().default(0),
  isOptional: z.literal("on").optional(),
  notes: optionalStoredText
});

const bundleComponentDeleteSchema = z.object({
  id: requiredText,
  productId: requiredText
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

function productMediaReturnPath(input: { previewMedia?: string; productId: string; returnTab: "details" | "media" }, mediaId?: string) {
  const params: Record<string, string> = { saved: "media", tab: input.returnTab };
  const previewMedia = mediaId || input.previewMedia;
  if (input.returnTab === "details" && previewMedia) params.previewMedia = previewMedia;
  return productEditPath(input.productId, params);
}

function productBundlePath(productId: string, params?: Record<string, string>) {
  // Bundle editing now lives inside the product editor's Bundle tab.
  return productEditPath(productId, { ...params, tab: "bundle" });
}

function hasUpload(file: FormDataEntryValue | null): file is File {
  return file instanceof File && file.size > 0;
}

function uniqueIds(values: FormDataEntryValue[]) {
  return Array.from(new Set(values.map(String).map((value) => value.trim()).filter(Boolean)));
}

function csvValues(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function productRequiresShipping(input: { requiresShipping: boolean; type: ProductType }) {
  return input.requiresShipping || input.type === ProductType.PHYSICAL;
}

async function assertProductForSite(productId: string, siteId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, siteId },
    select: { id: true, imageUrl: true, name: true, sku: true, type: true }
  });

  if (!product) {
    redirect(`/admin/modules/products?error=${encodeURIComponent("Product not found.")}`);
  }

  return product;
}

async function productPrimaryImageUrl(tx: Prisma.TransactionClient, productId: string) {
  const primary =
    (await tx.productMedia.findFirst({
      where: { productId, role: ProductMediaRole.PRIMARY },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { url: true }
    })) ||
    (await tx.productMedia.findFirst({
      where: { productId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { url: true }
    }));

  return primary?.url || "";
}

async function syncProductPrimaryImage(tx: Prisma.TransactionClient, productId: string) {
  await tx.product.update({
    where: { id: productId },
    data: { imageUrl: await productPrimaryImageUrl(tx, productId) }
  });
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
  const settings = await getSiteSettings();
  const siteId = settings.siteId;
  const slug = await generateUniqueCommerceSlug(prisma, "product", {
    name: input.name,
    slug: input.slug || "",
    siteId
  });
  const categoryIds = uniqueIds(formData.getAll("categoryIds"));
  const validCategories = categoryIds.length
    ? await prisma.productCategory.findMany({
        where: { id: { in: categoryIds }, siteId },
        select: { id: true }
      })
    : [];
  const newCategorySlug = input.newCategoryName
    ? await generateUniqueCommerceSlug(prisma, "category", {
        name: input.newCategoryName,
        slug: input.newCategorySlug || "",
        siteId
      })
    : "";
  const imageFile = formData.get("imageFile");
  let uploadedMedia:
    | Awaited<ReturnType<typeof uploadMedia>>
    | null = null;

  if (hasUpload(imageFile)) {
    try {
      uploadedMedia = await uploadMedia(
        imageFile,
        {
          alt: input.summary || input.name,
          folder: "products",
          tags: ["product", input.type.toLowerCase()],
          usageContext: "product"
        },
        settings.mediaDriver,
        siteId
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Product image upload failed.";
      redirect(`/admin/modules/products?error=${encodeURIComponent(message)}`);
    }
  }

  const mediaUrl = uploadedMedia ? mediaAssetDisplayUrl(uploadedMedia, MediaVariantType.HERO) : "";

  const product = await prisma.$transaction(async (tx) => {
    const createdCategory = input.newCategoryName
      ? await tx.productCategory.create({
          data: {
            siteId,
            name: input.newCategoryName,
            slug: newCategorySlug,
            status: input.status,
            sortOrder: 0
          },
          select: { id: true }
        })
      : null;
    const productCategories = createdCategory ? [...validCategories, createdCategory] : validCategories;

    return tx.product.create({
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
        imageUrl: mediaUrl,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        vendor: input.vendor,
        taxable: input.taxable,
        requiresShipping: productRequiresShipping(input),
        weightGrams: input.weightGrams,
        externalReference: input.externalReference,
        tags: input.tags,
        trackInventory: input.trackInventory,
        inventoryQuantity: input.inventoryQuantity,
        categoryAssignments: productCategories.length
          ? {
              create: productCategories.map((category) => ({ categoryId: category.id }))
            }
          : undefined,
        media: uploadedMedia
          ? {
              create: {
                mediaAssetId: uploadedMedia.id,
                role: ProductMediaRole.PRIMARY,
                url: mediaUrl,
                alt: uploadedMedia.alt || input.name
              }
            }
          : undefined,
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
  });

  refreshProducts();
  revalidatePath(productEditPath(product.id));
  redirect(productEditPath(product.id, { saved: "product" }));
}

export async function createProductQuickAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(productQuickCreateFormSchema, formData, "/admin/modules/products");
  const settings = await getSiteSettings();
  const siteId = settings.siteId;
  const slug = await generateUniqueCommerceSlug(prisma, "product", { name: input.name, siteId });
  const basePriceCents = input.basePrice ?? 0;

  const product = await prisma.product.create({
    data: {
      siteId,
      slug,
      name: input.name,
      type: input.type,
      status: ProductStatus.DRAFT,
      basePriceCents,
      currency: "USD",
      requiresShipping: input.type === ProductType.PHYSICAL,
      variants: {
        create: {
          name: "Default",
          priceCents: basePriceCents,
          isDefault: true,
          isActive: false
        }
      }
    },
    select: { id: true }
  });

  refreshProducts();
  revalidatePath(productEditPath(product.id));
  redirect(productEditPath(product.id, { saved: "created" }));
}

export async function updateProductAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(productUpdateFormSchema, formData);
  const settings = await getSiteSettings();
  const siteId = settings.siteId;
  const currentProduct = await prisma.product.findFirst({
    where: { id: input.id, siteId },
    select: { imageUrl: true, siteId: true, slug: true }
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

  const imageFile = formData.get("imageFile");
  let uploadedMedia:
    | Awaited<ReturnType<typeof uploadMedia>>
    | null = null;

  if (hasUpload(imageFile)) {
    try {
      uploadedMedia = await uploadMedia(
        imageFile,
        {
          alt: input.summary || input.name,
          folder: "products",
          tags: ["product", input.type.toLowerCase()],
          usageContext: "product"
        },
        settings.mediaDriver,
        siteId
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Product image upload failed.";
      redirect(productEditPath(input.id, { error: message }));
    }
  }

  const uploadedMediaUrl = uploadedMedia ? mediaAssetDisplayUrl(uploadedMedia, MediaVariantType.HERO) : "";

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
        imageUrl: uploadedMediaUrl || currentProduct.imageUrl,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        vendor: input.vendor,
        taxable: input.taxable,
        requiresShipping: productRequiresShipping(input),
        weightGrams: input.weightGrams,
        externalReference: input.externalReference,
        tags: input.tags,
        trackInventory: input.trackInventory,
        inventoryQuantity: input.inventoryQuantity
      }
    });

    if (uploadedMedia) {
      await tx.productMedia.updateMany({
        where: { productId: input.id, role: ProductMediaRole.PRIMARY },
        data: { role: ProductMediaRole.GALLERY }
      });
      await tx.productMedia.create({
        data: {
          productId: input.id,
          mediaAssetId: uploadedMedia.id,
          role: ProductMediaRole.PRIMARY,
          url: uploadedMediaUrl,
          alt: uploadedMedia.alt || input.name
        }
      });
    }

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
  redirect(productEditPath(input.productId, { saved: "variant", tab: "variants" }));
}

export async function uploadProductMediaAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(productMediaUploadSchema, formData);
  const settings = await getSiteSettings();
  await assertProductForSite(input.productId, settings.siteId);

  const file = formData.get("file");
  if (!hasUpload(file)) {
    redirect(productEditPath(input.productId, { error: "Choose an image before uploading." }));
  }

  let asset: Awaited<ReturnType<typeof uploadMedia>>;
  try {
    asset = await uploadMedia(
      file,
      {
        alt: input.alt,
        folder: "products",
        tags: ["product"],
        usageContext: "product"
      },
      settings.mediaDriver,
      settings.siteId
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Product image upload failed.";
    redirect(productEditPath(input.productId, { error: message }));
  }

  const url = mediaAssetDisplayUrl(asset, MediaVariantType.HERO);
  let createdMediaId = "";
  await prisma.$transaction(async (tx) => {
    const sortOrder = await tx.productMedia.count({ where: { productId: input.productId } });
    const shouldBePrimary = input.role === ProductMediaRole.PRIMARY || sortOrder === 0;
    if (shouldBePrimary) {
      await tx.productMedia.updateMany({
        where: { productId: input.productId, role: ProductMediaRole.PRIMARY },
        data: { role: ProductMediaRole.GALLERY }
      });
    }
    const media = await tx.productMedia.create({
      data: {
        productId: input.productId,
        mediaAssetId: asset.id,
        role: shouldBePrimary ? ProductMediaRole.PRIMARY : input.role,
        url,
        alt: input.alt || asset.alt || asset.filename,
        sortOrder
      },
      select: { id: true }
    });
    createdMediaId = media.id;
    await syncProductPrimaryImage(tx, input.productId);
  });

  refreshProducts();
  redirect(productMediaReturnPath(input, createdMediaId));
}

export async function attachProductMediaAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(productMediaAttachSchema, formData);
  const siteId = await getCurrentSiteId();
  await assertProductForSite(input.productId, siteId);

  const asset = await prisma.mediaAsset.findFirst({
    where: { id: input.mediaAssetId, siteId, deletedAt: null, isPrivate: false },
    select: { alt: true, driver: true, filename: true, id: true, isPrivate: true, key: true, storageProviderId: true, url: true }
  });
  if (!asset) {
    redirect(productEditPath(input.productId, { error: "Choose an active public media asset." }));
  }

  const url = mediaAssetDisplayUrl(asset, MediaVariantType.HERO);
  let createdMediaId = "";
  await prisma.$transaction(async (tx) => {
    const sortOrder = await tx.productMedia.count({ where: { productId: input.productId } });
    const shouldBePrimary = input.role === ProductMediaRole.PRIMARY || sortOrder === 0;
    if (shouldBePrimary) {
      await tx.productMedia.updateMany({
        where: { productId: input.productId, role: ProductMediaRole.PRIMARY },
        data: { role: ProductMediaRole.GALLERY }
      });
    }
    const media = await tx.productMedia.create({
      data: {
        productId: input.productId,
        mediaAssetId: asset.id,
        role: shouldBePrimary ? ProductMediaRole.PRIMARY : input.role,
        url,
        alt: input.alt || asset.alt || asset.filename,
        sortOrder
      },
      select: { id: true }
    });
    createdMediaId = media.id;
    await syncProductPrimaryImage(tx, input.productId);
  });

  refreshProducts();
  redirect(productMediaReturnPath(input, createdMediaId));
}

export async function setPrimaryProductMediaAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(productMediaSelectSchema, formData);
  const siteId = await getCurrentSiteId();
  await assertProductForSite(input.productId, siteId);

  await prisma.$transaction(async (tx) => {
    const media = await tx.productMedia.findFirst({
      where: { id: input.id, productId: input.productId },
      select: { id: true }
    });
    if (!media) throw new Error("Product image not found.");

    await tx.productMedia.updateMany({
      where: { productId: input.productId, role: ProductMediaRole.PRIMARY },
      data: { role: ProductMediaRole.GALLERY }
    });
    await tx.productMedia.update({
      where: { id: media.id },
      data: { role: ProductMediaRole.PRIMARY }
    });
    await syncProductPrimaryImage(tx, input.productId);
  });

  refreshProducts();
  redirect(productMediaReturnPath(input, input.id));
}

export async function removeProductMediaAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(productMediaSelectSchema, formData);
  const siteId = await getCurrentSiteId();
  await assertProductForSite(input.productId, siteId);

  await prisma.$transaction(async (tx) => {
    await tx.productMedia.deleteMany({ where: { id: input.id, productId: input.productId } });
    await syncProductPrimaryImage(tx, input.productId);
  });

  refreshProducts();
  redirect(productMediaReturnPath(input));
}

export async function createProductCategoryAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(productCategoryFormSchema, formData);
  const siteId = await getCurrentSiteId();
  const parent = input.parentId
    ? await prisma.productCategory.findFirst({ where: { id: input.parentId, siteId }, select: { id: true } })
    : null;
  if (input.parentId && !parent) {
    redirect(`/admin/modules/products?error=${encodeURIComponent("Parent category not found.")}`);
  }

  const slug = await generateUniqueCommerceSlug(prisma, "category", {
    name: input.name,
    slug: input.slug || "",
    siteId
  });

  await prisma.productCategory.create({
    data: {
      siteId,
      parentId: parent?.id,
      slug,
      name: input.name,
      description: input.description,
      status: input.status,
      isFeatured: input.isFeatured === "on",
      sortOrder: input.sortOrder
    }
  });

  refreshProducts();
  redirect("/admin/modules/products?saved=category");
}

export async function assignProductCategoryAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(productCategoryAssignmentFormSchema, formData);
  const siteId = await getCurrentSiteId();
  const [category, product] = await Promise.all([
    prisma.productCategory.findFirst({ where: { id: input.categoryId, siteId }, select: { id: true } }),
    prisma.product.findFirst({ where: { id: input.productId, siteId }, select: { id: true } })
  ]);
  if (!category || !product) {
    redirect(productEditPath(input.productId, { error: "Product or category not found." }));
  }

  await prisma.productCategoryAssignment.upsert({
    where: {
      categoryId_productId: {
        categoryId: input.categoryId,
        productId: input.productId
      }
    },
    update: {},
    create: {
      categoryId: input.categoryId,
      productId: input.productId
    }
  });

  refreshProducts();
  redirect(productEditPath(input.productId, { saved: "category", tab: "organization" }));
}

export async function removeProductCategoryAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(productCategoryAssignmentDeleteSchema, formData);
  const siteId = await getCurrentSiteId();
  await assertProductForSite(input.productId, siteId);
  await prisma.productCategoryAssignment.deleteMany({ where: { id: input.id, productId: input.productId } });

  refreshProducts();
  redirect(productEditPath(input.productId, { saved: "category", tab: "organization" }));
}

export async function createProductOptionAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(productOptionFormSchema, formData);
  const siteId = await getCurrentSiteId();
  await assertProductForSite(input.productId, siteId);
  const values = csvValues(input.values);

  await prisma.$transaction(async (tx) => {
    const option = await tx.productOption.upsert({
      where: {
        productId_name: {
          productId: input.productId,
          name: input.name
        }
      },
      update: { sortOrder: input.sortOrder },
      create: {
        productId: input.productId,
        name: input.name,
        sortOrder: input.sortOrder
      }
    });

    for (const [index, value] of values.entries()) {
      await tx.productOptionValue.upsert({
        where: {
          optionId_value: {
            optionId: option.id,
            value
          }
        },
        update: { sortOrder: index },
        create: {
          optionId: option.id,
          value,
          sortOrder: index
        }
      });
    }
  });

  refreshProducts();
  redirect(productEditPath(input.productId, { saved: "option", tab: "variants" }));
}

function optionCombinations<T>(groups: T[][]): T[][] {
  return groups.reduce<T[][]>((acc, group) => acc.flatMap((items) => group.map((item) => [...items, item])), [[]]);
}

export async function generateProductVariantsFromOptionsAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(productVariantMatrixSchema, formData);
  const siteId = await getCurrentSiteId();
  const product = await prisma.product.findFirst({
    where: { id: input.productId, siteId },
    include: {
      options: {
        include: { values: { orderBy: [{ sortOrder: "asc" }, { value: "asc" }] } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
      },
      variants: {
        include: { optionValues: { select: { optionValueId: true } } },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
      }
    }
  });

  if (!product) {
    redirect(`/admin/modules/products?error=${encodeURIComponent("Product not found.")}`);
  }

  const valueGroups = product.options.map((option) => option.values);
  if (!valueGroups.length || valueGroups.some((values) => values.length === 0)) {
    redirect(productEditPath(input.productId, { error: "Add at least one value for each option before generating variants." }));
  }

  const combinations = optionCombinations(valueGroups).slice(0, 250);
  const existingKeys = new Set(
    product.variants.map((variant) => variant.optionValues.map((item) => item.optionValueId).sort().join("|")).filter(Boolean)
  );

  await prisma.$transaction(async (tx) => {
    let reusableDefault = product.variants.find((variant) => variant.isDefault && variant.optionValues.length === 0 && variant.name === "Default");

    for (const [index, combination] of combinations.entries()) {
      const key = combination.map((value) => value.id).sort().join("|");
      if (existingKeys.has(key)) continue;

      const name = combination.map((value) => value.value).join(" / ");
      const firstValue = combination[0];
      const firstOption = product.options.find((option) => option.id === firstValue.optionId);
      const data = {
        name,
        optionName: product.options.length === 1 ? firstOption?.name || "" : "Options",
        optionValue: name,
        priceCents: product.basePriceCents,
        compareAtPriceCents: product.compareAtPriceCents,
        sku: "",
        trackInventory: false,
        inventoryQuantity: undefined,
        isActive: product.status === ProductStatus.ACTIVE,
        sortOrder: index
      };

      if (reusableDefault) {
        const variantId = reusableDefault.id;
        await tx.productVariant.update({
          where: { id: variantId },
          data
        });
        await tx.productVariantOptionValue.createMany({
          data: combination.map((value) => ({
            variantId,
            optionValueId: value.id
          })),
          skipDuplicates: true
        });
        reusableDefault = undefined;
        continue;
      }

      await tx.productVariant.create({
        data: {
          productId: product.id,
          ...data,
          isDefault: false,
          optionValues: {
            create: combination.map((value) => ({
              optionValueId: value.id
            }))
          }
        }
      });
    }
  });

  refreshProducts();
  redirect(productEditPath(input.productId, { saved: "variants", tab: "variants" }));
}

export async function updateProductVariantAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(productVariantUpdateSchema, formData);
  const siteId = await getCurrentSiteId();
  await assertProductForSite(input.productId, siteId);

  await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.productVariant.updateMany({
        where: { productId: input.productId },
        data: { isDefault: false }
      });
    }

    await tx.productVariant.updateMany({
      where: { id: input.id, productId: input.productId },
      data: {
        name: input.name,
        sku: input.sku,
        priceCents: input.price,
        compareAtPriceCents: input.compareAtPrice,
        trackInventory: input.trackInventory,
        inventoryQuantity: input.inventoryQuantity,
        isDefault: input.isDefault,
        isActive: input.isActive,
        sortOrder: input.sortOrder
      }
    });
  });

  refreshProducts();
  redirect(productEditPath(input.productId, { saved: "variant", tab: "variants" }));
}

export async function createBundleComponentAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(bundleComponentFormSchema, formData);
  const siteId = await getCurrentSiteId();
  const [bundle, component] = await Promise.all([
    prisma.product.findFirst({ where: { id: input.productId, siteId }, select: { id: true } }),
    prisma.product.findFirst({ where: { id: input.componentProductId, siteId }, select: { id: true } })
  ]);

  if (!bundle || !component || input.productId === input.componentProductId) {
    redirect(productBundlePath(input.productId, { error: "Choose a different product to include in the bundle." }));
  }

  if (input.componentVariantId) {
    const variant = await prisma.productVariant.findFirst({
      where: { id: input.componentVariantId, productId: input.componentProductId },
      select: { id: true }
    });
    if (!variant) {
      redirect(productBundlePath(input.productId, { error: "Bundle variant not found for that product." }));
    }
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.productBundleComponent.findFirst({
      where: {
        bundleProductId: input.productId,
        componentProductId: input.componentProductId,
        componentVariantId: input.componentVariantId || null
      },
      select: { id: true }
    });

    if (existing) {
      redirect(productBundlePath(input.productId, { error: "That bundle component is already included." }));
    }

    await tx.product.update({
      where: { id: input.productId },
      data: { type: ProductType.BUNDLE }
    });

    await tx.productBundleComponent.create({
      data: {
        bundleProductId: input.productId,
        componentProductId: input.componentProductId,
        componentVariantId: input.componentVariantId,
        quantity: input.quantity,
        sortOrder: input.sortOrder,
        isOptional: input.isOptional === "on",
        notes: input.notes
      }
    });
  });

  refreshProducts();
  redirect(productBundlePath(input.productId, { saved: "bundle" }));
}

export async function removeBundleComponentAction(formData: FormData) {
  await requireAdmin("products:manage");
  const input = await parseForm(bundleComponentDeleteSchema, formData);
  const siteId = await getCurrentSiteId();
  await assertProductForSite(input.productId, siteId);
  await prisma.productBundleComponent.deleteMany({ where: { id: input.id, bundleProductId: input.productId } });

  refreshProducts();
  redirect(productBundlePath(input.productId, { saved: "bundle" }));
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
    if (!order.items.some((item) => item.product.requiresShipping || item.product.type === ProductType.PHYSICAL)) {
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
    const physicalItemCount = order.items.filter((item) => item.product.requiresShipping || item.product.type === ProductType.PHYSICAL).length;
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
    const physicalItemCount = order.items.filter((item) => item.product.requiresShipping || item.product.type === ProductType.PHYSICAL).length;
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
