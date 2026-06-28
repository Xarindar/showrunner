import NextImage from "next/image";
import { notFound } from "next/navigation";
import { MediaDriver, MediaVariantType, ProductMediaRole, ProductStatus, ProductType, type Prisma } from "@prisma/client";
import {
  ArrowLeft,
  Boxes,
  ExternalLink,
  ImageIcon,
  Layers3,
  PackagePlus,
  Plus,
  Save,
  Tags,
  Trash2
} from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { enumLabel, stringArrayCsv } from "@/lib/format";
import { isCloudflareImagesConfigured, isR2Configured, isServerAssetStorageConfigured, mediaAssetDisplayUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { AssetPicker, Button, ButtonLink, type AssetPickerAsset } from "@/components/ui";
import {
  assignProductCategoryAction,
  attachProductMediaAction,
  createProductOptionAction,
  createProductVariantAction,
  generateProductVariantsFromOptionsAction,
  removeProductCategoryAction,
  updateProductAction,
  updateProductVariantAction,
  uploadProductMediaAction
} from "./actions";

type ProductEditPageProps = {
  productId: string;
  searchParams: Promise<{ error?: string; saved?: string }>;
};

type ProductWithEditorData = Prisma.ProductGetPayload<{
  include: {
    categoryAssignments: { include: { category: true } };
    media: { include: { mediaAsset: true } };
    options: { include: { values: true } };
    variants: { include: { optionValues: { include: { optionValue: { include: { option: true } } } } } };
  };
}>;

function moneyInput(cents?: number | null) {
  return typeof cents === "number" ? (cents / 100).toFixed(2) : "";
}

function statusClass(status: ProductStatus) {
  if (status === ProductStatus.ACTIVE) return "catalog-status is-active";
  if (status === ProductStatus.ARCHIVED) return "catalog-status is-archived";
  return "catalog-status is-draft";
}

function variantInventoryLabel(variant: { inventoryQuantity: number | null; trackInventory: boolean }) {
  if (!variant.trackInventory) return "Not tracked";
  return `${variant.inventoryQuantity ?? 0} in stock`;
}

function canUploadWithDriver(driver: MediaDriver) {
  if (driver === MediaDriver.SERVER_ASSETS) return isServerAssetStorageConfigured();
  if (driver === MediaDriver.R2) return isR2Configured();
  if (driver === MediaDriver.CLOUDFLARE_IMAGES) return isCloudflareImagesConfigured();
  return false;
}

function productMediaUrl(media: ProductWithEditorData["media"][number]) {
  if (media.mediaAsset) return mediaAssetDisplayUrl(media.mediaAsset, MediaVariantType.CARD);
  return media.url;
}

function variantOptionLabel(variant: ProductWithEditorData["variants"][number]) {
  const optionValues = variant.optionValues
    .map(({ optionValue }) => `${optionValue.option.name}: ${optionValue.value}`)
    .join(", ");
  if (optionValues) return optionValues;
  if (variant.optionName || variant.optionValue) return `${variant.optionName || "Option"}: ${variant.optionValue || variant.name}`;
  return variant.isDefault ? "Default" : "Custom";
}

function savedProductMessage(saved?: string) {
  if (saved === "media") return "Product media updated.";
  if (saved === "category") return "Product categories updated.";
  if (saved === "option") return "Product option saved.";
  if (saved === "variants") return "Variant matrix generated.";
  if (saved === "variant") return "Variant saved.";
  if (saved === "bundle") return "Bundle contents updated.";
  if (saved) return "Product changes saved.";
  return null;
}

export default async function ProductEditPage({ productId, searchParams }: ProductEditPageProps) {
  await requireAdmin("products:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const [product, categories, mediaAssets] = await Promise.all([
    prisma.product.findFirst({
      where: { id: productId, siteId: settings.siteId },
      include: {
        categoryAssignments: {
          include: { category: true },
          orderBy: { createdAt: "asc" }
        },
        media: {
          include: { mediaAsset: true },
          orderBy: [{ role: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
        },
        options: {
          include: { values: { orderBy: [{ sortOrder: "asc" }, { value: "asc" }] } },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
        },
        variants: {
          include: {
            optionValues: {
              include: { optionValue: { include: { option: true } } },
              orderBy: { optionValue: { option: { sortOrder: "asc" } } }
            }
          },
          orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
        }
      }
    }),
    prisma.productCategory.findMany({
      where: { siteId: settings.siteId },
      orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { name: "asc" }]
    }),
    prisma.mediaAsset.findMany({
      where: { siteId: settings.siteId, deletedAt: null, isPrivate: false },
      orderBy: { createdAt: "desc" },
      take: 40
    })
  ]);

  if (!product) notFound();

  const canUpload = canUploadWithDriver(settings.mediaDriver);
  const assignedCategoryIds = new Set(product.categoryAssignments.map(({ categoryId }) => categoryId));
  const availableCategories = categories.filter((category) => !assignedCategoryIds.has(category.id));
  const savedMessage = savedProductMessage(params.saved);
  const errorMessage = params.error || null;
  const defaultVariant = product.variants[0] || null;
  const primaryMedia = product.media.find((item) => item.role === ProductMediaRole.PRIMARY) || product.media[0] || null;
  const primaryMediaUrl = primaryMedia ? productMediaUrl(primaryMedia) : "";
  const primaryImageUploadFormId = `product-${product.id}-primary-image-upload`;
  const primaryImageAttachFormId = `product-${product.id}-primary-image-attach`;
  const mediaAssetOptions: AssetPickerAsset[] = mediaAssets.map((asset) => ({
    alt: asset.alt || asset.filename,
    filename: asset.filename,
    id: asset.id,
    thumbnailUrl: mediaAssetDisplayUrl(asset, MediaVariantType.CARD)
  }));

  return (
    <div className="product-studio-page">
      <header className="product-studio-header">
        <div className="product-studio-title">
          <ButtonLink href="/admin/modules/products" size="sm" variant="ghost">
            <ArrowLeft size={16} />
            Products
          </ButtonLink>
          <div>
            <p className="catalog-kicker">Product studio</p>
            <h1>{product.name}</h1>
            <p>/shop/{product.slug}</p>
          </div>
          <div className="product-studio-badges">
            <span className={statusClass(product.status)}>{product.status.toLowerCase()}</span>
            <span className="catalog-pill">{enumLabel(product.type)}</span>
            <span className="catalog-pill">{product.variants.length} variants</span>
            <span className="catalog-pill">{product.media.length} media</span>
          </div>
        </div>
        <div className="product-studio-actions">
          <ButtonLink href={`/admin/modules/products/${product.id}/bundles`} size="sm" variant="secondary">
            <Boxes size={15} />
            Bundle builder
          </ButtonLink>
          {product.status === ProductStatus.ACTIVE ? (
            <ButtonLink href={`/shop/${product.slug}`} rel="noreferrer" size="sm" target="_blank" variant="secondary">
              <ExternalLink size={15} />
              View shop
            </ButtonLink>
          ) : null}
          <Button form="product-studio-form" size="sm" type="submit">
            <Save size={15} />
            Save product
          </Button>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{decodeURIComponent(errorMessage)}</div> : null}

      <form action={updateProductAction} className="product-studio-save-grid" id="product-studio-form">
        <input type="hidden" name="id" value={product.id} />
        <main className="product-studio-main">
          <section className="studio-hero-panel">
            <AssetPicker
              assets={mediaAssetOptions}
              attachFields={{ productId: product.id, role: ProductMediaRole.PRIMARY }}
              attachFormId={primaryImageAttachFormId}
              canUpload={canUpload}
              defaultAlt={product.name}
              emptyLibraryMessage="No reusable product assets yet."
              title="Product image"
              triggerClassName={canUpload ? "studio-media-stage studio-media-upload-target" : "studio-media-stage studio-media-upload-target is-disabled"}
              triggerHint={canUpload ? (primaryMediaUrl ? "Change image" : "Add image") : "Choose from library"}
              uploadFields={{ productId: product.id, role: ProductMediaRole.PRIMARY }}
              uploadFormId={primaryImageUploadFormId}>
              {primaryMediaUrl ? (
                <NextImage alt={primaryMedia?.alt || product.name} fill priority sizes="(max-width: 920px) 100vw, 420px" src={primaryMediaUrl} unoptimized />
              ) : (
                <span className="studio-media-empty">
                  <ImageIcon size={30} />
                  <span>No product image</span>
                </span>
              )}
            </AssetPicker>
            <div className="studio-hero-copy">
              <p className="catalog-rail-label">Primary setup</p>
              <h2>{product.name}</h2>
              <p>{product.summary || "Add a short summary so the storefront card has useful selling copy."}</p>
              <dl className="studio-hero-meta">
                <div>
                  <dt>Price</dt>
                  <dd>{moneyInput(defaultVariant?.priceCents ?? product.basePriceCents) || "0.00"} {product.currency}</dd>
                </div>
                <div>
                  <dt>SKU</dt>
                  <dd>{defaultVariant?.sku || product.sku || "No SKU"}</dd>
                </div>
                <div>
                  <dt>Categories</dt>
                  <dd>{product.categoryAssignments.length}</dd>
                </div>
              </dl>
              {!canUpload ? <p className="muted-text">Enable Server asset folder, R2, or Cloudflare Images in Settings to upload product images.</p> : null}
            </div>
          </section>

          <section className="studio-panel">
            <div className="studio-section-head">
              <div>
                <p className="catalog-rail-label">Story</p>
                <h2>Product copy</h2>
              </div>
            </div>
            <div className="catalog-form-grid">
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-name`}>Title</label>
                <input id={`product-${product.id}-name`} name="name" defaultValue={product.name} required />
              </div>
              <div className="catalog-form-grid is-two">
                <div className="ui-field">
                  <label htmlFor={`product-${product.id}-slug`}>Shop URL slug</label>
                  <input id={`product-${product.id}-slug`} name="slug" defaultValue={product.slug} />
                </div>
                <div className="ui-field">
                  <label htmlFor={`product-${product.id}-vendor`}>Vendor or brand</label>
                  <input id={`product-${product.id}-vendor`} name="vendor" defaultValue={product.vendor} />
                </div>
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-summary`}>Short summary</label>
                <input id={`product-${product.id}-summary`} name="summary" defaultValue={product.summary} />
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-description`}>Description</label>
                <textarea id={`product-${product.id}-description`} name="description" defaultValue={product.description} />
              </div>
              <div className="catalog-form-grid is-two">
                <div className="ui-field">
                  <label htmlFor={`product-${product.id}-seo-title`}>SEO title</label>
                  <input id={`product-${product.id}-seo-title`} name="seoTitle" defaultValue={product.seoTitle} />
                </div>
                <div className="ui-field">
                  <label htmlFor={`product-${product.id}-external`}>External reference</label>
                  <input id={`product-${product.id}-external`} name="externalReference" defaultValue={product.externalReference} />
                </div>
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-seo-description`}>SEO description</label>
                <input id={`product-${product.id}-seo-description`} name="seoDescription" defaultValue={product.seoDescription} />
              </div>
            </div>
          </section>

          <section className="studio-panel">
            <div className="studio-section-head">
              <div>
                <p className="catalog-rail-label">Commerce</p>
                <h2>Pricing and inventory</h2>
              </div>
            </div>
            <div className="catalog-form-grid is-three">
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-base-price`}>Price</label>
                <input id={`product-${product.id}-base-price`} name="basePrice" defaultValue={moneyInput(product.basePriceCents)} inputMode="decimal" required />
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-compare-price`}>Compare-at price</label>
                <input id={`product-${product.id}-compare-price`} name="compareAtPrice" defaultValue={moneyInput(product.compareAtPriceCents)} inputMode="decimal" />
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-sku`}>SKU</label>
                <input id={`product-${product.id}-sku`} name="sku" defaultValue={product.sku || defaultVariant?.sku || ""} />
              </div>
            </div>
            <div className="catalog-form-grid is-three">
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-currency`}>Currency</label>
                <input id={`product-${product.id}-currency`} name="currency" defaultValue={product.currency} maxLength={3} required />
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-weight`}>Weight grams</label>
                <input id={`product-${product.id}-weight`} name="weightGrams" min="0" type="number" defaultValue={product.weightGrams ?? ""} />
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-inventory`}>Default inventory</label>
                <input id={`product-${product.id}-inventory`} name="inventoryQuantity" min="0" type="number" defaultValue={product.inventoryQuantity ?? ""} />
              </div>
            </div>
            <div className="studio-toggle-strip">
              <label className="ui-check-row">
                <input name="taxable" type="checkbox" defaultChecked={product.taxable} />
                Taxable
              </label>
              <label className="ui-check-row">
                <input name="requiresShipping" type="checkbox" defaultChecked={product.requiresShipping} />
                Requires shipping or fulfillment
              </label>
              <label className="ui-check-row">
                <input name="trackInventory" type="checkbox" defaultChecked={product.trackInventory} />
                Track default inventory
              </label>
            </div>
          </section>
        </main>

        <aside className="product-studio-sidecar">
          <section className="studio-side-panel">
            <div className="studio-section-head">
              <div>
                <p className="catalog-rail-label">Publishing</p>
                <h2>Status</h2>
              </div>
            </div>
            <div className="catalog-form-grid">
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-status`}>Status</label>
                <select id={`product-${product.id}-status`} name="status" defaultValue={product.status}>
                  {Object.values(ProductStatus).map((status) => (
                    <option key={status} value={status}>
                      {status.toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-type`}>Product type</label>
                <select id={`product-${product.id}-type`} name="type" defaultValue={product.type}>
                  {Object.values(ProductType).map((type) => (
                    <option key={type} value={type}>
                      {enumLabel(type)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-tags`}>Tags</label>
                <input id={`product-${product.id}-tags`} name="tags" defaultValue={stringArrayCsv(product.tags)} placeholder="package, featured" />
              </div>
            </div>
            <Button className="studio-save-button" type="submit">
              <Save size={16} />
              Save product
            </Button>
          </section>

          <section className="studio-side-panel">
            <div className="studio-section-head">
              <div>
                <p className="catalog-rail-label">Readiness</p>
                <h2>Build snapshot</h2>
              </div>
              <Boxes size={20} />
            </div>
            <dl className="studio-readiness-list">
              <div>
                <dt>Variants</dt>
                <dd>{product.variants.length}</dd>
              </div>
              <div>
                <dt>Option groups</dt>
                <dd>{product.options.length}</dd>
              </div>
              <div>
                <dt>Media</dt>
                <dd>{product.media.length}</dd>
              </div>
              <div>
                <dt>Categories</dt>
                <dd>{product.categoryAssignments.length}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </form>
      <form action={uploadProductMediaAction} id={primaryImageUploadFormId} />
      <form action={attachProductMediaAction} id={primaryImageAttachFormId} />

      <section className="studio-workbench">
        <div className="studio-section-head">
          <div>
            <p className="catalog-rail-label">Variants</p>
            <h2>Option matrix</h2>
          </div>
          <Layers3 size={20} />
        </div>
        <div className="studio-option-list">
          {product.options.map((option) => (
            <div className="studio-option-row" key={option.id}>
              <strong>{option.name}</strong>
              <span>{option.values.map((value) => value.value).join(", ") || "No values yet"}</span>
            </div>
          ))}
          {!product.options.length ? <p className="muted-text">No option groups yet.</p> : null}
        </div>
        <div className="studio-action-grid">
          <form action={createProductOptionAction} className="studio-action-form">
            <input type="hidden" name="productId" value={product.id} />
            <h3>Add option group</h3>
            <div className="catalog-form-grid is-two">
              <div className="ui-field">
                <label htmlFor="option-name">Name</label>
                <input id="option-name" name="name" placeholder="Size" required />
              </div>
              <div className="ui-field">
                <label htmlFor="option-sort">Sort</label>
                <input id="option-sort" name="sortOrder" type="number" defaultValue={product.options.length} />
              </div>
            </div>
            <div className="ui-field">
              <label htmlFor="option-values">Values</label>
              <textarea id="option-values" name="values" placeholder="8x10, 11x14, 16x20" />
            </div>
            <Button type="submit" variant="secondary">
              <Plus size={16} />
              Save option
            </Button>
          </form>

          <form action={generateProductVariantsFromOptionsAction} className="studio-action-form is-compact">
            <input type="hidden" name="productId" value={product.id} />
            <h3>Generate matrix</h3>
            <p className="muted-text">Creates missing variant combinations from every option value. Existing variants are preserved.</p>
            <Button type="submit" variant="secondary" disabled={!product.options.length}>
              <Layers3 size={16} />
              Generate variants
            </Button>
          </form>
        </div>

        <div className="studio-variant-list">
          {product.variants.map((variant) => (
            <form action={updateProductVariantAction} className="studio-variant-row" key={variant.id}>
              <input type="hidden" name="id" value={variant.id} />
              <input type="hidden" name="productId" value={product.id} />
              <div className="studio-variant-name">
                <strong>{variant.name}</strong>
                <small>{variantOptionLabel(variant)}</small>
              </div>
              <div className="ui-field">
                <label htmlFor={`variant-${variant.id}-name`}>Name</label>
                <input id={`variant-${variant.id}-name`} name="name" defaultValue={variant.name} required />
              </div>
              <div className="ui-field">
                <label htmlFor={`variant-${variant.id}-sku`}>SKU</label>
                <input id={`variant-${variant.id}-sku`} name="sku" defaultValue={variant.sku || ""} />
              </div>
              <div className="ui-field">
                <label htmlFor={`variant-${variant.id}-price`}>Price</label>
                <input id={`variant-${variant.id}-price`} name="price" inputMode="decimal" defaultValue={moneyInput(variant.priceCents)} />
              </div>
              <div className="ui-field">
                <label htmlFor={`variant-${variant.id}-inventory`}>Stock</label>
                <input id={`variant-${variant.id}-inventory`} name="inventoryQuantity" min="0" type="number" defaultValue={variant.inventoryQuantity ?? ""} />
              </div>
              <div className="ui-field">
                <label htmlFor={`variant-${variant.id}-sort`}>Sort</label>
                <input id={`variant-${variant.id}-sort`} name="sortOrder" type="number" defaultValue={variant.sortOrder} />
              </div>
              <div className="studio-variant-flags">
                <label className="ui-check-row">
                  <input name="trackInventory" type="checkbox" defaultChecked={variant.trackInventory} />
                  Stock
                </label>
                <label className="ui-check-row">
                  <input name="isDefault" type="checkbox" defaultChecked={variant.isDefault} />
                  Default
                </label>
                <label className="ui-check-row">
                  <input name="isActive" type="checkbox" defaultChecked={variant.isActive} />
                  Active
                </label>
              </div>
              <span className="studio-variant-stock">{variantInventoryLabel(variant)}</span>
              <Button size="sm" type="submit" variant="secondary">
                Save
              </Button>
            </form>
          ))}
        </div>

        <form action={createProductVariantAction} className="studio-action-form studio-custom-variant">
          <input type="hidden" name="productId" value={product.id} />
          <div className="studio-section-head">
            <h3>Add custom variant</h3>
            <Button type="submit" variant="secondary">
              <Plus size={16} />
              Add variant
            </Button>
          </div>
          <div className="catalog-form-grid is-three">
            <div className="ui-field">
              <label htmlFor="variantName">Name</label>
              <input id="variantName" name="name" placeholder="Large print" required />
            </div>
            <div className="ui-field">
              <label htmlFor="variantSku">SKU</label>
              <input id="variantSku" name="sku" />
            </div>
            <div className="ui-field">
              <label htmlFor="variantPrice">Price override</label>
              <input id="variantPrice" name="price" inputMode="decimal" />
            </div>
          </div>
          <div className="catalog-form-grid is-three">
            <div className="ui-field">
              <label htmlFor="optionName">Option name</label>
              <input id="optionName" name="optionName" placeholder="Size" />
            </div>
            <div className="ui-field">
              <label htmlFor="optionValue">Option value</label>
              <input id="optionValue" name="optionValue" placeholder="16x20" />
            </div>
            <div className="ui-field">
              <label htmlFor="variantInventory">Inventory quantity</label>
              <input id="variantInventory" name="inventoryQuantity" min="0" type="number" />
            </div>
          </div>
          <div className="studio-toggle-strip">
            <label className="ui-check-row">
              <input name="trackInventory" type="checkbox" />
              Track inventory
            </label>
            <label className="ui-check-row">
              <input name="isDefault" type="checkbox" />
              Default
            </label>
            <label className="ui-check-row">
              <input name="isActive" type="checkbox" defaultChecked />
              Active
            </label>
          </div>
        </form>
      </section>

      <section className="studio-workbench">
        <div className="studio-section-head">
          <div>
            <p className="catalog-rail-label">Categories</p>
            <h2>Storefront organization</h2>
          </div>
          <Tags size={20} />
        </div>
        <div className="studio-token-list">
          {product.categoryAssignments.map((assignment) => (
            <form action={removeProductCategoryAction} className="studio-token-form" key={assignment.id}>
              <input type="hidden" name="id" value={assignment.id} />
              <input type="hidden" name="productId" value={product.id} />
              <span>{assignment.category.name}</span>
              <Button aria-label={`Remove ${assignment.category.name}`} size="sm" type="submit" variant="ghost">
                <Trash2 size={14} />
              </Button>
            </form>
          ))}
          {!product.categoryAssignments.length ? <span className="muted-text">Not assigned to a category.</span> : null}
        </div>
        {availableCategories.length ? (
          <form action={assignProductCategoryAction} className="studio-action-form studio-inline-form">
            <input type="hidden" name="productId" value={product.id} />
            <div className="ui-field">
              <label htmlFor="categoryId">Add category</label>
              <select id="categoryId" name="categoryId">
                {availableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="secondary">
              <PackagePlus size={16} />
              Add
            </Button>
          </form>
        ) : null}
      </section>

    </div>
  );
}
