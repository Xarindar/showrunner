import NextImage from "next/image";
import { MediaDriver, MediaVariantType, Prisma, ProductStatus, ProductType } from "@prisma/client";
import { Camera, ImageIcon, PackagePlus } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { enumLabel, formatMoney } from "@/lib/format";
import { isCloudflareImagesConfigured, isR2Configured, isServerAssetStorageConfigured, mediaAssetDisplayUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import {
  createGiftCardAction,
  createProductAction,
  updateProductStatusAction
} from "./actions";
import { Button, ButtonLink, Pagination, TableFilterBar, type TableFilterSelect } from "@/components/ui";
import { CatalogCreateMenu } from "./catalog-create-menu";

export const dynamic = "force-dynamic";

const pageSize = 50;
const statusFilters = ["all", ...Object.values(ProductStatus).map((status) => status.toLowerCase())] as const;

type ProductsPageProps = {
  searchParams: Promise<{ saved?: string; error?: string; page?: string; status?: string; q?: string }>;
};

function normalizeStatusFilter(value?: string) {
  return statusFilters.includes(value as (typeof statusFilters)[number]) ? value || "all" : "all";
}

function productsHref({ page, q, status }: { page?: number; q?: string; status?: string }) {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (q) params.set("q", q);
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/modules/products?${query}` : "/admin/modules/products";
}

function canUploadWithDriver(driver: MediaDriver) {
  if (driver === MediaDriver.SERVER_ASSETS) return isServerAssetStorageConfigured();
  if (driver === MediaDriver.R2) return isR2Configured();
  if (driver === MediaDriver.CLOUDFLARE_IMAGES) return isCloudflareImagesConfigured();
  return false;
}

function productStatusClass(status: ProductStatus) {
  if (status === ProductStatus.ACTIVE) return "catalog-status is-active";
  if (status === ProductStatus.ARCHIVED) return "catalog-status is-archived";
  return "catalog-status is-draft";
}

function productInventoryLabel(product: {
  inventoryQuantity: number | null;
  trackInventory: boolean;
  variants: { inventoryQuantity: number | null; trackInventory: boolean }[];
}) {
  const trackedVariants = product.variants.filter((variant) => variant.trackInventory);
  const trackedQuantities = trackedVariants.flatMap((variant) =>
    typeof variant.inventoryQuantity === "number" ? [variant.inventoryQuantity] : []
  );

  if (!product.trackInventory && !trackedVariants.length) return "Not tracked";
  if (trackedQuantities.length) return `${trackedQuantities.reduce((total, quantity) => total + quantity, 0)} in stock`;
  if (typeof product.inventoryQuantity === "number") return `${product.inventoryQuantity} in stock`;
  return "Tracked";
}

function productMediaUrl(product: {
  media: {
    url: string;
    mediaAsset: Parameters<typeof mediaAssetDisplayUrl>[0] | null;
  }[];
}) {
  const media = product.media[0];
  if (!media) return "";
  return media.mediaAsset ? mediaAssetDisplayUrl(media.mediaAsset, MediaVariantType.CARD) : media.url;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  await requireAdmin("products:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const page = Math.max(1, Number(params.page || 1) || 1);
  const statusFilter = normalizeStatusFilter(params.status);
  const searchQuery = (params.q || "").trim().slice(0, 120);
  const canUpload = canUploadWithDriver(settings.mediaDriver);
  const productWhere: Prisma.ProductWhereInput = {
    siteId: settings.siteId,
    ...(statusFilter === "all" ? {} : { status: statusFilter.toUpperCase() as ProductStatus }),
    ...(searchQuery
      ? {
          OR: [
            { name: { contains: searchQuery, mode: "insensitive" } },
            { slug: { contains: searchQuery, mode: "insensitive" } },
            { sku: { contains: searchQuery, mode: "insensitive" } },
            { summary: { contains: searchQuery, mode: "insensitive" } },
            { vendor: { contains: searchQuery, mode: "insensitive" } }
          ]
        }
      : {})
  };

  const [products, productCount, activeCount, draftCount, archivedCount, categories] = await Promise.all([
    prisma.product.findMany({
      where: productWhere,
      include: {
        variants: { orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }] },
        categoryAssignments: {
          include: { category: true },
          orderBy: { createdAt: "asc" }
        },
        media: {
          include: { mediaAsset: true },
          orderBy: [{ role: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
          take: 1
        },
        _count: { select: { bundleComponents: true, media: true, options: true } }
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.product.count({ where: productWhere }),
    prisma.product.count({ where: { siteId: settings.siteId, status: ProductStatus.ACTIVE } }),
    prisma.product.count({ where: { siteId: settings.siteId, status: ProductStatus.DRAFT } }),
    prisma.product.count({ where: { siteId: settings.siteId, status: ProductStatus.ARCHIVED } }),
    prisma.productCategory.findMany({
      where: { siteId: settings.siteId },
      orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { name: "asc" }]
    })
  ]);
  const pageCount = Math.max(1, Math.ceil(productCount / pageSize));
  const rangeStart = productCount ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(productCount, page * pageSize);
  const savedMessage = params.saved ? "Catalog changes saved." : null;
  const errorMessage = params.error || null;
  const totalStatusCount = activeCount + draftCount + archivedCount;
  const statusSelect: TableFilterSelect = {
    id: "products-status-filter",
    label: "Status",
    name: "status",
    value: statusFilter,
    options: statusFilters.map((filter) => {
      const count = filter === "all" ? totalStatusCount : filter === "active" ? activeCount : filter === "draft" ? draftCount : archivedCount;
      const label = filter === "all" ? "All" : filter[0].toUpperCase() + filter.slice(1);
      return { label: `${label} (${count})`, value: filter };
    })
  };

  const addProductForm = (
    <form action={createProductAction} className="catalog-form-grid">
      <div className="catalog-form-grid is-two">
        <div className="ui-field">
          <label htmlFor="name">Product name</label>
          <input id="name" name="name" required />
        </div>
        <div className="ui-field">
          <label htmlFor="slug">Shop URL slug</label>
          <input id="slug" name="slug" placeholder="starter-package" />
        </div>
      </div>
      <div className="catalog-form-grid is-three">
        <div className="ui-field">
          <label htmlFor="type">Type</label>
          <select id="type" name="type" defaultValue={ProductType.PHYSICAL}>
            {Object.values(ProductType).map((type) => (
              <option key={type} value={type}>
                {enumLabel(type)}
              </option>
            ))}
          </select>
        </div>
        <div className="ui-field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={ProductStatus.DRAFT}>
            {Object.values(ProductStatus).map((status) => (
              <option key={status} value={status}>
                {status.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div className="ui-field">
          <label htmlFor="currency">Currency</label>
          <input id="currency" name="currency" defaultValue="USD" maxLength={3} required />
        </div>
      </div>
      <div className="catalog-form-grid is-three">
        <div className="ui-field">
          <label htmlFor="basePrice">Price</label>
          <input id="basePrice" name="basePrice" inputMode="decimal" placeholder="125.00" required />
        </div>
        <div className="ui-field">
          <label htmlFor="compareAtPrice">Compare-at price</label>
          <input id="compareAtPrice" name="compareAtPrice" inputMode="decimal" />
        </div>
        <div className="ui-field">
          <label htmlFor="sku">SKU</label>
          <input id="sku" name="sku" />
        </div>
      </div>
      <div className="ui-field">
        <label htmlFor="summary">Short summary</label>
        <input id="summary" name="summary" />
      </div>
      <div className="ui-field">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" />
      </div>
      <div className="catalog-form-grid is-two">
        <div className="ui-field">
          <label htmlFor="vendor">Vendor or brand</label>
          <input id="vendor" name="vendor" />
        </div>
        <div className="ui-field">
          <label htmlFor="tags">Tags</label>
          <input id="tags" name="tags" placeholder="package, featured" />
        </div>
      </div>
      <div className="ui-field">
        <label htmlFor="imageFile">Primary image</label>
        <input id="imageFile" name="imageFile" type="file" accept="image/*" disabled={!canUpload} />
        {!canUpload ? <small className="muted-text">Enable Server asset folder, R2, or Cloudflare Images in Settings to upload.</small> : null}
      </div>
      <fieldset className="catalog-check-fieldset">
        <legend>Categories</legend>
        {categories.length ? (
          <div className="catalog-check-grid">
            {categories.map((category) => (
              <label className="ui-check-row" key={category.id}>
                <input name="categoryIds" type="checkbox" value={category.id} />
                {category.name}
              </label>
            ))}
          </div>
        ) : (
          <span className="muted-text">No categories yet.</span>
        )}
        <div className="catalog-form-grid is-two">
          <div className="ui-field">
            <label htmlFor="newCategoryName">New category</label>
            <input id="newCategoryName" name="newCategoryName" placeholder="Print packages" />
          </div>
          <div className="ui-field">
            <label htmlFor="newCategorySlug">Category URL slug</label>
            <input id="newCategorySlug" name="newCategorySlug" placeholder="print-packages" />
          </div>
        </div>
      </fieldset>
      <div className="catalog-check-grid">
        <label className="ui-check-row">
          <input name="taxable" type="checkbox" defaultChecked />
          Taxable
        </label>
        <label className="ui-check-row">
          <input name="requiresShipping" type="checkbox" defaultChecked />
          Requires shipping or fulfillment
        </label>
        <label className="ui-check-row">
          <input name="trackInventory" type="checkbox" />
          Track default inventory
        </label>
      </div>
      <div className="ui-field">
        <label htmlFor="inventoryQuantity">Inventory quantity</label>
        <input id="inventoryQuantity" name="inventoryQuantity" min="0" type="number" />
      </div>
      <div className="module-modal-actions">
        <Button type="submit">
          <PackagePlus size={18} />
          Create product
        </Button>
      </div>
    </form>
  );

  const giftCardForm = (
    <form action={createGiftCardAction} className="catalog-form-grid">
      <div className="catalog-form-grid is-three">
        <div className="ui-field">
          <label htmlFor="giftCardCode">Code</label>
          <input id="giftCardCode" name="code" placeholder="Auto-generate" />
        </div>
        <div className="ui-field">
          <label htmlFor="giftCardAmount">Amount</label>
          <input id="giftCardAmount" name="amount" inputMode="decimal" required />
        </div>
        <div className="ui-field">
          <label htmlFor="giftCardCurrency">Currency</label>
          <input id="giftCardCurrency" name="currency" defaultValue="USD" maxLength={3} required />
        </div>
      </div>
      <div className="catalog-form-grid is-two">
        <div className="ui-field">
          <label htmlFor="giftCardRecipientName">Recipient name</label>
          <input id="giftCardRecipientName" name="recipientName" />
        </div>
        <div className="ui-field">
          <label htmlFor="giftCardRecipientEmail">Recipient email</label>
          <input id="giftCardRecipientEmail" name="recipientEmail" type="email" />
        </div>
      </div>
      <div className="catalog-form-grid is-two">
        <div className="ui-field">
          <label htmlFor="giftCardPurchaserName">Purchaser name</label>
          <input id="giftCardPurchaserName" name="purchaserName" />
        </div>
        <div className="ui-field">
          <label htmlFor="giftCardPurchaserEmail">Purchaser email</label>
          <input id="giftCardPurchaserEmail" name="purchaserEmail" type="email" />
        </div>
      </div>
      <div className="ui-field">
        <label htmlFor="giftCardNote">Note</label>
        <input id="giftCardNote" name="note" />
      </div>
      <Button type="submit" variant="secondary">
        Issue gift card
      </Button>
    </form>
  );

  return (
    <div className="products-workspace">
      <header className="products-page-header">
        <h1>Products</h1>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{decodeURIComponent(errorMessage)}</div> : null}

      <main className="catalog-board" aria-labelledby="products-board-title">
          <div className="catalog-board-header">
            <div>
              <p className="catalog-rail-label">Inventory</p>
              <h2 id="products-board-title">Product board</h2>
              <p>
                {rangeStart}-{rangeEnd} of {productCount}
                {searchQuery ? ` matching "${searchQuery}"` : " products"}
              </p>
            </div>
            <div className="catalog-board-actions">
              <span className="catalog-pill is-blue">
                <Camera size={15} />
                {canUpload ? "Uploads ready" : "Storage setup needed"}
              </span>
              <CatalogCreateMenu
                items={[
                  { content: addProductForm, description: "Create a sellable catalog item.", id: "product", label: "Product", title: "Create product", type: "product" },
                  { content: giftCardForm, description: "Issue store credit for a customer.", id: "gift-card", label: "Gift card", title: "Issue gift card", type: "gift-card" }
                ]}
              />
            </div>
          </div>

          <TableFilterBar
            action="/admin/modules/products"
            className="catalog-board-filters"
            clearHref="/admin/modules/products"
            searchId="products-search"
            searchPlaceholder="Search product, SKU, vendor"
            searchValue={searchQuery}
            selects={[statusSelect]}
            showClear={Boolean(searchQuery || statusFilter !== "all")}
          />

          <div className="catalog-table-scroll">
            <table className="catalog-product-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Status</th>
                  <th>Type</th>
                  <th>Inventory</th>
                  <th>Categories</th>
                  <th>Build</th>
                  <th>Price</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const defaultVariant = product.variants[0] || null;
                  const priceCents = defaultVariant?.priceCents ?? product.basePriceCents;
                  const categoryLabel = product.categoryAssignments.map(({ category }) => category.name).join(", ") || "Uncategorized";
                  const skuLabel = defaultVariant?.sku || product.sku || "No SKU";
                  const imageUrl = productMediaUrl(product);
                  const buildLabel = [
                    `${product.variants.length} var`,
                    `${product._count.options} opt`,
                    `${product._count.media} img`,
                    product._count.bundleComponents ? `${product._count.bundleComponents} bundle` : ""
                  ].filter(Boolean).join(" / ");

                  return (
                    <tr key={product.id}>
                      <td>
                        <div className="catalog-product-cell">
                          <div className="catalog-row-thumb">
                            {imageUrl ? (
                              <NextImage alt={product.name} fill sizes="44px" src={imageUrl} unoptimized />
                            ) : (
                              <span>
                                <ImageIcon size={17} />
                              </span>
                            )}
                          </div>
                          <div className="catalog-row-copy">
                            <strong title={product.name}>{product.name}</strong>
                            <small title={`/shop/${product.slug} · ${skuLabel} · ${product.summary || product.description || "No product copy yet."}`}>
                              {skuLabel} · {product.summary || product.description || "No product copy yet."}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={productStatusClass(product.status)}>{product.status.toLowerCase()}</span>
                      </td>
                      <td>
                        <span className="catalog-cell-text" title={enumLabel(product.type)}>{enumLabel(product.type)}</span>
                      </td>
                      <td>
                        <span className="catalog-cell-text" title={productInventoryLabel(product)}>{productInventoryLabel(product)}</span>
                      </td>
                      <td>
                        <span className="catalog-cell-text" title={categoryLabel}>{categoryLabel}</span>
                      </td>
                      <td>
                        <span className="catalog-cell-text" title={buildLabel}>{buildLabel}</span>
                      </td>
                      <td>
                        <strong className="catalog-price-cell">{formatMoney(priceCents, product.currency)}</strong>
                      </td>
                      <td>
                        <div className="catalog-row-actions">
                          <ButtonLink href={`/admin/modules/products/${product.id}`} size="sm" variant="secondary">
                            Edit
                          </ButtonLink>
                          <form action={updateProductStatusAction} className="ui-inline-form">
                            <input type="hidden" name="id" value={product.id} />
                            <input type="hidden" name="status" value={product.status === ProductStatus.ACTIVE ? ProductStatus.DRAFT : ProductStatus.ACTIVE} />
                            <Button size="sm" type="submit" variant={product.status === ProductStatus.ACTIVE ? "ghost" : "primary"}>
                              {product.status === ProductStatus.ACTIVE ? "Draft" : "Activate"}
                            </Button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!products.length ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="catalog-empty-state">
                        <PackagePlus size={30} />
                        <h3>No products yet</h3>
                        <p>Create the first product to start building the catalog.</p>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <Pagination
            label="Product pages"
            nextHref={productsHref({ page: Math.min(pageCount, page + 1), q: searchQuery, status: statusFilter })}
            page={page}
            pageCount={pageCount}
            previousHref={productsHref({ page: Math.max(1, page - 1), q: searchQuery, status: statusFilter })}
          />
      </main>
    </div>
  );
}
