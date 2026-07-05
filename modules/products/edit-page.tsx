import NextImage from "next/image";
import { notFound } from "next/navigation";
import { MediaDriver, MediaVariantType, ProductMediaRole, ProductStatus, ProductType, type Prisma } from "@prisma/client";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  FileText,
  ImageIcon,
  Images,
  Layers3,
  Plus,
  Save,
  Star,
  Tags,
  Trash2,
  Wand2
} from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { enumLabel, stringArrayCsv } from "@/lib/format";
import { isCloudflareImagesConfigured, isR2Configured, isServerAssetStorageConfigured, mediaAssetDisplayUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { AssetPicker, Button, ButtonLink, Switch, SwitchReveal, type AssetPickerAsset } from "@/components/ui";
import {
  assignProductCategoryAction,
  attachProductMediaAction,
  createBundleComponentAction,
  createProductOptionAction,
  createProductVariantAction,
  generateProductVariantsFromOptionsAction,
  removeBundleComponentAction,
  removeProductCategoryAction,
  removeProductMediaAction,
  setPrimaryProductMediaAction,
  updateProductAction,
  updateProductVariantAction,
  uploadProductMediaAction
} from "./actions";
import { ProductEditorTabs, type ProductEditorTab } from "./product-editor-tabs";
import { ProductSlugFields } from "./product-slug-fields";
import { VariantTable, type VariantRow } from "./variant-table";

type ProductEditPageProps = {
  productId: string;
  searchParams: Promise<{ error?: string; previewMedia?: string; saved?: string; tab?: string }>;
};

type ProductWithEditorData = Prisma.ProductGetPayload<{
  include: {
    categoryAssignments: { include: { category: true } };
    media: { include: { mediaAsset: true } };
    options: { include: { values: true } };
    variants: { include: { optionValues: { include: { optionValue: { include: { option: true } } } } } };
    bundleComponents: {
      include: {
        componentProduct: { select: { currency: true; id: true; name: true; sku: true; type: true } };
        componentVariant: { select: { id: true; name: true; sku: true } };
      };
    };
  };
}>;

function moneyInput(cents?: number | null) {
  return typeof cents === "number" ? (cents / 100).toFixed(2) : "";
}

function percentLabel(basisPoints?: number | null) {
  if (typeof basisPoints !== "number") return "0%";
  const percent = basisPoints / 100;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2)}%`;
}

function statusClass(status: ProductStatus) {
  if (status === ProductStatus.ACTIVE) return "catalog-status is-active";
  if (status === ProductStatus.ARCHIVED) return "catalog-status is-archived";
  return "catalog-status is-draft";
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

function productMediaPreviewHref(productId: string, mediaId: string) {
  const query = new URLSearchParams({ previewMedia: mediaId, tab: "details" });
  return `/admin/modules/products/${productId}?${query.toString()}`;
}

function variantOptionLabel(variant: ProductWithEditorData["variants"][number]) {
  const optionValues = variant.optionValues
    .map(({ optionValue }) => `${optionValue.option.name}: ${optionValue.value}`)
    .join(", ");
  if (optionValues) return optionValues;
  if (variant.optionName || variant.optionValue) return `${variant.optionName || "Option"}: ${variant.optionValue || variant.name}`;
  return variant.isDefault ? "Default variant" : "Custom";
}

function savedProductMessage(saved?: string) {
  if (saved === "created") return "Draft created. Fill in the details below, then activate when ready.";
  if (saved === "media") return "Product media updated.";
  if (saved === "category") return "Product categories updated.";
  if (saved === "option") return "Product option saved.";
  if (saved === "variants") return "Variant matrix generated.";
  if (saved === "variant") return "Variant saved.";
  if (saved === "bundle") return "Bundle contents updated.";
  if (saved) return "Product changes saved.";
  return null;
}

function seoSummary(product: { seoTitle: string | null; seoDescription: string | null }) {
  if (product.seoTitle && product.seoDescription) return "Custom title and description set";
  if (product.seoTitle) return "Custom title set";
  if (product.seoDescription) return "Custom description set";
  return "Not customized";
}

export default async function ProductEditPage({ productId, searchParams }: ProductEditPageProps) {
  await requireAdmin("products:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const [product, categories, mediaAssets, bundleProducts] = await Promise.all([
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
        },
        bundleComponents: {
          include: {
            componentProduct: { select: { currency: true, id: true, name: true, sku: true, type: true } },
            componentVariant: { select: { id: true, name: true, sku: true } }
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
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
    }),
    prisma.product.findMany({
      where: { id: { not: productId }, siteId: settings.siteId, status: { not: ProductStatus.ARCHIVED } },
      include: {
        variants: {
          where: { isActive: true },
          orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { name: "asc" }]
        }
      },
      orderBy: { name: "asc" },
      take: 200
    })
  ]);

  if (!product) notFound();

  const canUpload = canUploadWithDriver(settings.mediaDriver);
  const assignedCategoryIds = new Set(product.categoryAssignments.map(({ categoryId }) => categoryId));
  const availableCategories = categories.filter((category) => !assignedCategoryIds.has(category.id));
  const savedMessage = savedProductMessage(params.saved);
  const errorMessage = params.error || null;
  const defaultVariant = product.variants[0] || null;
  const assignedPrimaryMedia = product.media.find((item) => item.role === ProductMediaRole.PRIMARY) || null;
  const primaryMedia = assignedPrimaryMedia || product.media[0] || null;
  const selectedMedia = (params.previewMedia ? product.media.find((item) => item.id === params.previewMedia) : null) || primaryMedia;
  const selectedMediaUrl = selectedMedia ? productMediaUrl(selectedMedia) : "";
  const selectedMediaIsPrimary = selectedMedia?.role === ProductMediaRole.PRIMARY;
  const isBundle = product.type === ProductType.BUNDLE;
  const showBundleTab = isBundle || product.bundleComponents.length > 0;
  const priceIsZero = product.basePriceCents === 0;
  const showZeroPriceWarning = priceIsZero && product.status !== ProductStatus.ARCHIVED;
  const taxRuleSummary = settings.commerceTaxEnabled
    ? `${settings.commerceTaxLabel || "Sales tax"} · ${percentLabel(settings.commerceTaxRateBps)}`
    : "Tax is disabled in Payments settings";

  const mediaAssetOptions: AssetPickerAsset[] = mediaAssets.map((asset) => ({
    alt: asset.alt || asset.filename,
    filename: asset.filename,
    id: asset.id,
    thumbnailUrl: mediaAssetDisplayUrl(asset, MediaVariantType.CARD)
  }));

  const detailsUploadFormId = `product-${product.id}-details-image-upload`;
  const detailsAttachFormId = `product-${product.id}-details-image-attach`;
  const selectedPrimaryFormId = selectedMedia ? `product-${product.id}-primary-${selectedMedia.id}` : "";
  const galleryUploadFormId = `product-${product.id}-gallery-upload`;
  const galleryAttachFormId = `product-${product.id}-gallery-attach`;

  const variantRows: VariantRow[] = product.variants.map((variant) => ({
    compareAtPrice: moneyInput(variant.compareAtPriceCents),
    id: variant.id,
    inventoryQuantity: typeof variant.inventoryQuantity === "number" ? String(variant.inventoryQuantity) : "",
    isActive: variant.isActive,
    isDefault: variant.isDefault,
    name: variant.name,
    optionLabel: variantOptionLabel(variant),
    price: moneyInput(variant.priceCents),
    sku: variant.sku || "",
    sortOrder: variant.sortOrder,
    stockLabel: variant.trackInventory ? `${variant.inventoryQuantity ?? 0} in stock` : "Not tracked",
    trackInventory: variant.trackInventory
  }));

  const detailsContent = (
    <>
      <form action={updateProductAction} className="product-studio-save-grid" id="product-core-form">
        <input name="id" type="hidden" value={product.id} />
        <main className="product-studio-main">
          <section className="studio-panel product-details-panel">
            <div className="studio-section-head">
              <div>
                <p className="catalog-rail-label">Product details</p>
                <h2>Title, image &amp; description</h2>
              </div>
            </div>
            <div className="product-details-grid">
              <div className="product-details-media">
                <p className="catalog-rail-label">Product images</p>
                <div className="product-image-manager">
                  <div className="product-image-stage-shell">
                    <AssetPicker
                      assets={mediaAssetOptions}
                      attachFields={{ productId: product.id, returnTab: "details", role: ProductMediaRole.GALLERY }}
                      attachFormId={detailsAttachFormId}
                      canUpload={canUpload}
                      defaultAlt={product.name}
                      emptyLibraryMessage="No reusable product assets yet."
                      title="Add product image"
                      triggerClassName={selectedMediaUrl ? "product-image-stage product-image-stage-trigger has-image" : "product-image-stage product-image-stage-trigger"}
                      triggerHint=""
                      uploadFields={{ productId: product.id, returnTab: "details", role: ProductMediaRole.GALLERY }}
                      uploadFormId={detailsUploadFormId}>
                      {selectedMediaUrl ? (
                        <NextImage alt={selectedMedia?.alt || product.name} fill priority sizes="(max-width: 760px) 100vw, (max-width: 1280px) 300px, 320px" src={selectedMediaUrl} unoptimized />
                      ) : (
                        <span className="studio-media-empty">
                          <ImageIcon size={26} />
                          <span>No product image</span>
                        </span>
                      )}
                    </AssetPicker>
                    {selectedMedia ? (
                      selectedMediaIsPrimary ? (
                        <span aria-label="This is the main image customers see" className="product-image-primary-star is-active" title="Main image customers see">
                          <Star fill="currentColor" size={16} />
                        </span>
                      ) : (
                        <Button
                          aria-label="Make this the main image customers see"
                          className="product-image-primary-star"
                          form={selectedPrimaryFormId}
                          size="sm"
                          title="Make main image"
                          type="submit"
                          variant="secondary">
                          <Star size={16} />
                        </Button>
                      )
                    ) : null}
                  </div>
                  {product.media.length ? (
                    <div aria-label="Product images" className="product-image-strip">
                      {product.media.map((item) => {
                        const url = productMediaUrl(item);
                        const isSelected = item.id === selectedMedia?.id;
                        const isPrimary = item.role === ProductMediaRole.PRIMARY;
                        return (
                          <a
                            aria-current={isSelected ? "true" : undefined}
                            className={`product-image-thumb${isSelected ? " is-selected" : ""}${isPrimary ? " is-primary" : ""}`}
                            href={productMediaPreviewHref(product.id, item.id)}
                            key={item.id}
                            title={isPrimary ? "Main image" : "Preview image"}>
                            {url ? (
                              <NextImage alt={item.alt || product.name} fill sizes="64px" src={url} unoptimized />
                            ) : (
                              <span className="studio-media-empty">
                                <ImageIcon size={18} />
                              </span>
                            )}
                            {isPrimary ? (
                              <span className="product-image-thumb-star" aria-label="Main image">
                                <Star fill="currentColor" size={12} />
                              </span>
                            ) : null}
                          </a>
                        );
                      })}
                    </div>
                  ) : (
                    <div aria-hidden="true" className="product-image-strip is-empty">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <span className="product-image-thumb-skeleton" key={index} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="catalog-form-grid">
                <ProductSlugFields productId={product.id} slug={product.slug} summary={product.summary} title={product.name} />
                <div className="ui-field">
                  <label htmlFor={`product-${product.id}-description`}>Description</label>
                  <textarea defaultValue={product.description} id={`product-${product.id}-description`} name="description" />
                </div>
              </div>
            </div>
          </section>

          <section className="studio-panel">
            <div className="studio-section-head">
              <div>
                <p className="catalog-rail-label">Pricing</p>
                <h2>Price &amp; tax</h2>
              </div>
            </div>
            <div className="catalog-form-grid is-three">
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-base-price`}>Price</label>
                <input defaultValue={moneyInput(product.basePriceCents)} id={`product-${product.id}-base-price`} inputMode="decimal" name="basePrice" required />
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-compare-price`}>Compare-at price</label>
                <input defaultValue={moneyInput(product.compareAtPriceCents)} id={`product-${product.id}-compare-price`} inputMode="decimal" name="compareAtPrice" />
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-currency`}>Currency</label>
                <input defaultValue={product.currency} id={`product-${product.id}-currency`} maxLength={3} name="currency" required />
              </div>
            </div>
            {showZeroPriceWarning ? (
              <p className="product-editor-warning">
                <AlertTriangle size={15} />
                This product is $0.00 — customers can buy it for free. Set a price before activating if that is not intended.
              </p>
            ) : null}
            <div className="catalog-form-grid is-two product-pricing-meta">
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-sku`}>SKU</label>
                <input defaultValue={product.sku || defaultVariant?.sku || ""} id={`product-${product.id}-sku`} name="sku" />
              </div>
              <div className="ui-switch-reveal-list product-tax-switch">
                <SwitchReveal
                  defaultChecked={product.taxable}
                  description="Include this item in the taxable checkout subtotal."
                  label="Charge tax on this product"
                  name="taxable">
                  <div className="ui-field ui-reveal-field">
                    <label htmlFor={`product-${product.id}-tax-rule`}>Tax rule</label>
                    <input id={`product-${product.id}-tax-rule`} readOnly value={taxRuleSummary} />
                  </div>
                </SwitchReveal>
              </div>
            </div>
          </section>

          <section className="studio-panel">
            <div className="studio-section-head">
              <div>
                <p className="catalog-rail-label">Inventory &amp; fulfillment</p>
                <h2>Stock and shipping</h2>
              </div>
            </div>
            <div className="ui-switch-reveal-list">
              <SwitchReveal
                defaultChecked={product.trackInventory}
                description="Keep a count for stock-sensitive products."
                label="Track quantity for the default variant"
                name="trackInventory">
                <div className="ui-field ui-reveal-field">
                  <label htmlFor={`product-${product.id}-inventory`}>Quantity</label>
                  <input defaultValue={product.inventoryQuantity ?? ""} id={`product-${product.id}-inventory`} min="0" name="inventoryQuantity" type="number" />
                </div>
              </SwitchReveal>
              <SwitchReveal
                defaultChecked={product.requiresShipping}
                description="Use weight for shipping and fulfillment rules."
                label="This is a physical product that ships"
                name="requiresShipping">
                <div className="ui-field ui-reveal-field">
                  <label htmlFor={`product-${product.id}-weight`}>Weight (grams)</label>
                  <input defaultValue={product.weightGrams ?? ""} id={`product-${product.id}-weight`} min="0" name="weightGrams" type="number" />
                </div>
              </SwitchReveal>
            </div>
          </section>

          <details className="product-editor-advanced">
            <summary>
              <span>Search engine listing</span>
              <small>{seoSummary(product)}</small>
            </summary>
            <div className="catalog-form-grid">
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-seo-title`}>SEO title</label>
                <input defaultValue={product.seoTitle} id={`product-${product.id}-seo-title`} name="seoTitle" />
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-seo-description`}>SEO description</label>
                <input defaultValue={product.seoDescription} id={`product-${product.id}-seo-description`} name="seoDescription" />
              </div>
            </div>
          </details>

          <details className="product-editor-advanced">
            <summary>
              <span>External reference</span>
              <small>{product.externalReference ? "Linked" : "None"}</small>
            </summary>
            <div className="ui-field">
              <label htmlFor={`product-${product.id}-external`}>External reference ID</label>
              <input defaultValue={product.externalReference} id={`product-${product.id}-external`} name="externalReference" placeholder="e.g. an ID from another system" />
            </div>
          </details>
        </main>

        <aside className="product-studio-sidecar">
          <section className="studio-side-panel">
            <div className="studio-section-head">
              <div>
                <p className="catalog-rail-label">Publishing</p>
                <h2>Status &amp; organization</h2>
              </div>
            </div>
            <div className="catalog-form-grid">
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-status`}>Status</label>
                <select defaultValue={product.status} id={`product-${product.id}-status`} name="status">
                  {Object.values(ProductStatus).map((status) => (
                    <option key={status} value={status}>
                      {status.toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
              {showZeroPriceWarning ? (
                <p className="product-editor-hint">
                  <AlertTriangle size={14} />
                  $0.00 price — free to buy.
                </p>
              ) : null}
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-type`}>Type</label>
                <select defaultValue={product.type} id={`product-${product.id}-type`} name="type">
                  {Object.values(ProductType).map((type) => (
                    <option key={type} value={type}>
                      {enumLabel(type)}
                    </option>
                  ))}
                </select>
                {!showBundleTab ? <small className="muted-text">Choose Bundle and save to compose this from other products.</small> : null}
                {isBundle && product.bundleComponents.length ? (
                  <small className="muted-text">Changing away from Bundle keeps components but stops selling them together.</small>
                ) : null}
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-vendor`}>Vendor or brand</label>
                <input defaultValue={product.vendor} id={`product-${product.id}-vendor`} name="vendor" />
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-tags`}>Tags</label>
                <input defaultValue={stringArrayCsv(product.tags)} id={`product-${product.id}-tags`} name="tags" placeholder="package, featured" />
              </div>
            </div>
            <Button className="studio-save-button" type="submit">
              <Save size={16} />
              Save details
            </Button>
          </section>
        </aside>
      </form>

      <form action={uploadProductMediaAction} id={detailsUploadFormId} />
      <form action={attachProductMediaAction} id={detailsAttachFormId} />
      {selectedMedia && !selectedMediaIsPrimary ? (
        <form action={setPrimaryProductMediaAction} id={selectedPrimaryFormId}>
          <input name="id" type="hidden" value={selectedMedia.id} />
          <input name="previewMedia" type="hidden" value={selectedMedia.id} />
          <input name="productId" type="hidden" value={product.id} />
          <input name="returnTab" type="hidden" value="details" />
        </form>
      ) : null}
    </>
  );

  const variantsContent = (
    <div className="product-editor-stack">
      <section className="studio-panel">
        <div className="studio-section-head">
          <div>
            <p className="catalog-rail-label">Options</p>
            <h2>Option groups</h2>
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
          {!product.options.length ? <p className="muted-text">No option groups yet. Add one to generate a variant matrix.</p> : null}
        </div>
        <div className="product-editor-option-actions">
          <form action={createProductOptionAction} className="studio-action-form">
            <input name="productId" type="hidden" value={product.id} />
            <div className="catalog-form-grid is-two">
              <div className="ui-field">
                <label htmlFor="option-name">New option</label>
                <input id="option-name" name="name" placeholder="Size" required />
              </div>
              <div className="ui-field">
                <label htmlFor="option-sort">Sort</label>
                <input defaultValue={product.options.length} id="option-sort" name="sortOrder" type="number" />
              </div>
            </div>
            <div className="ui-field">
              <label htmlFor="option-values">Values (comma separated)</label>
              <textarea id="option-values" name="values" placeholder="8x10, 11x14, 16x20" />
            </div>
            <Button type="submit" variant="secondary">
              <Plus size={16} />
              Save option
            </Button>
          </form>
          <form action={generateProductVariantsFromOptionsAction} className="product-editor-generate">
            <input name="productId" type="hidden" value={product.id} />
            <p className="muted-text">Generate every missing variant combination from your option values. Existing variants are kept.</p>
            <Button disabled={!product.options.length} type="submit" variant="secondary">
              <Wand2 size={16} />
              Generate variants
            </Button>
          </form>
        </div>
      </section>

      <section className="studio-panel">
        <div className="studio-section-head">
          <div>
            <p className="catalog-rail-label">Variants</p>
            <h2>{product.variants.length} variant{product.variants.length === 1 ? "" : "s"}</h2>
          </div>
        </div>
        <VariantTable productId={product.id} updateAction={updateProductVariantAction} variants={variantRows} />

        <details className="product-editor-advanced">
          <summary>
            <span>Add a single variant</span>
            <small>Manual entry</small>
          </summary>
          <form action={createProductVariantAction} className="studio-action-form">
            <input name="productId" type="hidden" value={product.id} />
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
                <input id="variantPrice" inputMode="decimal" name="price" />
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
                <input id="variantInventory" min="0" name="inventoryQuantity" type="number" />
              </div>
            </div>
            <div className="studio-toggle-strip">
              <Switch label="Track inventory" name="trackInventory" variant="inline" />
              <Switch label="Default" name="isDefault" variant="inline" />
              <Switch defaultChecked label="Active" name="isActive" variant="inline" />
            </div>
            <Button type="submit" variant="secondary">
              <Plus size={16} />
              Add variant
            </Button>
          </form>
        </details>
      </section>
    </div>
  );

  const mediaContent = (
    <section className="studio-panel">
      <div className="studio-section-head">
        <div>
          <p className="catalog-rail-label">Media</p>
          <h2>Gallery</h2>
        </div>
        <AssetPicker
          assets={mediaAssetOptions}
          attachFields={{ productId: product.id, role: ProductMediaRole.GALLERY }}
          attachFormId={galleryAttachFormId}
          canUpload={canUpload}
          defaultAlt={product.name}
          emptyLibraryMessage="No reusable product assets yet."
          title="Add product media"
          triggerClassName="ui-button ui-button-secondary ui-button-sm product-media-add"
          triggerHint=""
          uploadFields={{ productId: product.id, role: ProductMediaRole.GALLERY }}
          uploadFormId={galleryUploadFormId}>
          <Images size={15} />
          Add media
        </AssetPicker>
      </div>

      {product.media.length ? (
        <div className="product-media-grid">
          {product.media.map((item) => {
            const isPrimary = item.role === ProductMediaRole.PRIMARY;
            const url = productMediaUrl(item);
            return (
              <div className="product-media-item" key={item.id}>
                <div className="product-media-thumb">
                  {url ? (
                    <NextImage alt={item.alt || product.name} fill sizes="220px" src={url} unoptimized />
                  ) : (
                    <span className="studio-media-empty">
                      <ImageIcon size={22} />
                    </span>
                  )}
                  {isPrimary ? (
                    <span className="product-media-primary-badge">
                      <Star size={12} />
                      Primary
                    </span>
                  ) : null}
                </div>
                <div className="product-media-actions">
                  {!isPrimary ? (
                    <form action={setPrimaryProductMediaAction}>
                      <input name="id" type="hidden" value={item.id} />
                      <input name="productId" type="hidden" value={product.id} />
                      <Button size="sm" type="submit" variant="secondary">
                        <Star size={13} />
                        Set primary
                      </Button>
                    </form>
                  ) : null}
                  <form action={removeProductMediaAction}>
                    <input name="id" type="hidden" value={item.id} />
                    <input name="productId" type="hidden" value={product.id} />
                    <Button aria-label="Remove image" size="sm" type="submit" variant="ghost">
                      <Trash2 size={14} />
                    </Button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="catalog-empty-state">
          <ImageIcon size={28} />
          <h3>No media yet</h3>
          <p>Add a product image to show on the storefront.</p>
        </div>
      )}

      <form action={uploadProductMediaAction} id={galleryUploadFormId} />
      <form action={attachProductMediaAction} id={galleryAttachFormId} />
    </section>
  );

  const organizationContent = (
    <section className="studio-panel">
      <div className="studio-section-head">
        <div>
          <p className="catalog-rail-label">Organization</p>
          <h2>Categories</h2>
        </div>
        <Tags size={20} />
      </div>
      <div className="product-category-chips">
        {product.categoryAssignments.map((assignment) => (
          <form action={removeProductCategoryAction} className="product-category-chip" key={assignment.id}>
            <input name="id" type="hidden" value={assignment.id} />
            <input name="productId" type="hidden" value={product.id} />
            <span>{assignment.category.name}</span>
            <Button aria-label={`Remove ${assignment.category.name}`} size="sm" type="submit" variant="ghost">
              <Trash2 size={13} />
            </Button>
          </form>
        ))}
        {!product.categoryAssignments.length ? <span className="muted-text">Not assigned to a category yet.</span> : null}
      </div>
      {availableCategories.length ? (
        <form action={assignProductCategoryAction} className="product-editor-inline-form">
          <input name="productId" type="hidden" value={product.id} />
          <div className="ui-field">
            <label htmlFor="categoryId">Add to category</label>
            <select id="categoryId" name="categoryId">
              {availableCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary">
            <Plus size={16} />
            Add
          </Button>
        </form>
      ) : (
        <p className="muted-text">{categories.length ? "Assigned to every category." : "No categories exist yet. Create one from the storefront settings."}</p>
      )}
    </section>
  );

  const bundleContent = (
    <section className="studio-panel">
      <div className="studio-section-head">
        <div>
          <p className="catalog-rail-label">Bundle</p>
          <h2>Included products</h2>
        </div>
        <Boxes size={20} />
      </div>

      {product.bundleComponents.length ? (
        <div className="catalog-table-scroll">
          <table className="catalog-product-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Variant</th>
                <th>Qty</th>
                <th>Optional</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {product.bundleComponents.map((component) => (
                <tr key={component.id}>
                  <td>
                    <span className="catalog-cell-text" title={component.componentProduct.name}>{component.componentProduct.name}</span>
                    <small className="muted-text">{component.componentProduct.sku || component.notes || "No SKU"}</small>
                  </td>
                  <td>
                    <span className="catalog-cell-text">{component.componentVariant?.name || "Default"}</span>
                  </td>
                  <td>{component.quantity}</td>
                  <td>{component.isOptional ? "Yes" : "No"}</td>
                  <td>
                    <form action={removeBundleComponentAction}>
                      <input name="id" type="hidden" value={component.id} />
                      <input name="productId" type="hidden" value={product.id} />
                      <Button aria-label="Remove component" size="sm" type="submit" variant="ghost">
                        <Trash2 size={14} />
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="catalog-empty-state">
          <Boxes size={28} />
          <h3>No bundle items</h3>
          <p>Add products and quantities to sell them together as a bundle.</p>
        </div>
      )}

      <details className="product-editor-advanced" open={!product.bundleComponents.length}>
        <summary>
          <span>Add a bundle component</span>
          <small>{bundleProducts.length ? `${bundleProducts.length} products available` : "No other products"}</small>
        </summary>
        <form action={createBundleComponentAction} className="studio-action-form">
          <input name="productId" type="hidden" value={product.id} />
          <div className="catalog-form-grid is-two">
            <div className="ui-field">
              <label htmlFor="componentProductId">Product</label>
              <select id="componentProductId" name="componentProductId">
                {bundleProducts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="ui-field">
              <label htmlFor="componentVariantId">Variant</label>
              <select defaultValue="" id="componentVariantId" name="componentVariantId">
                <option value="">Default / any active variant</option>
                {bundleProducts.flatMap((item) =>
                  item.variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {item.name} - {variant.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
          <div className="catalog-form-grid is-three">
            <div className="ui-field">
              <label htmlFor="bundleQuantity">Quantity</label>
              <input defaultValue="1" id="bundleQuantity" max="999" min="1" name="quantity" type="number" />
            </div>
            <div className="ui-field">
              <label htmlFor="bundleSort">Sort</label>
              <input defaultValue={product.bundleComponents.length} id="bundleSort" name="sortOrder" type="number" />
            </div>
            <Switch label="Optional component" name="isOptional" variant="inline" />
          </div>
          <div className="ui-field">
            <label htmlFor="bundleNotes">Notes</label>
            <input id="bundleNotes" name="notes" />
          </div>
          <Button disabled={!bundleProducts.length} type="submit" variant="secondary">
            <Plus size={16} />
            Add bundle item
          </Button>
        </form>
      </details>
    </section>
  );

  const tabs: ProductEditorTab[] = [
    { content: detailsContent, icon: <FileText size={15} />, id: "details", label: "Details" },
    { content: variantsContent, icon: <Layers3 size={15} />, id: "variants", label: "Variants" },
    { content: mediaContent, icon: <Images size={15} />, id: "media", label: "Media" },
    { content: organizationContent, icon: <Tags size={15} />, id: "organization", label: "Organization" }
  ];
  if (showBundleTab) {
    tabs.push({ content: bundleContent, icon: <Boxes size={15} />, id: "bundle", label: "Bundle" });
  }

  return (
    <div className="product-studio-page product-editor-page">
      <header className="product-studio-header">
        <div className="product-studio-title">
          <ButtonLink href="/admin/modules/products" size="sm" variant="ghost">
            <ArrowLeft size={16} />
            Products
          </ButtonLink>
          <div>
            <p className="catalog-kicker">Product editor</p>
            <h1>{product.name}</h1>
            <p>Slug: {product.slug}</p>
          </div>
          <div className="product-studio-badges">
            <span className={statusClass(product.status)}>{product.status.toLowerCase()}</span>
            <span className="catalog-pill">{enumLabel(product.type)}</span>
          </div>
        </div>
        <div className="product-studio-actions">
          <Button form="product-core-form" size="sm" type="submit">
            <Save size={15} />
            Save details
          </Button>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{decodeURIComponent(errorMessage)}</div> : null}

      <ProductEditorTabs initialTab={params.tab} tabs={tabs} />
    </div>
  );
}
