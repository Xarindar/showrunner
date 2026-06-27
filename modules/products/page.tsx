import NextImage from "next/image";
import { GiftCardStatus, Prisma, ProductStatus, ProductType } from "@prisma/client";
import { Boxes, ImageIcon, PackagePlus, Search, Tags } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { enumLabel, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import {
  createCollectionAction,
  createGiftCardAction,
  createProductAction,
  updateProductStatusAction } from "./actions";
import { Button, ButtonAnchor, Card, EqualGrid, Pagination, Table } from "@/components/ui";
import { ModuleActionModals } from "@/components/ui/module-action-modals";

export const dynamic = "force-dynamic";

const pageSize = 50;
const statusFilters = ["all", ...Object.values(ProductStatus).map((status) => status.toLowerCase())] as const;

type ProductsPageProps = {
  searchParams: Promise<{saved?: string;error?: string;page?: string;status?: string;q?: string;}>;
};

function normalizeStatusFilter(value?: string) {
  return statusFilters.includes(value as (typeof statusFilters)[number]) ? value || "all" : "all";
}

function productStatusClass(status: ProductStatus) {
  if (status === ProductStatus.ACTIVE) return "ui-badge ui-badge-success";
  if (status === ProductStatus.ARCHIVED) return "ui-badge ui-badge-danger";
  return "ui-badge";
}

function productsHref({
  page,
  q,
  status
}: {
  page?: number;
  q?: string;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (q) params.set("q", q);
  if (page && page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/modules/products?${query}` : "/admin/modules/products";
}

function productInventoryLabel(product: {
  inventoryQuantity: number | null;
  trackInventory: boolean;
  variants: {inventoryQuantity: number | null;trackInventory: boolean;}[];
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

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  await requireAdmin("products:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const page = Math.max(1, Number(params.page || 1) || 1);
  const statusFilter = normalizeStatusFilter(params.status);
  const searchQuery = (params.q || "").trim().slice(0, 120);
  const productWhere: Prisma.ProductWhereInput = {
    siteId: settings.siteId,
    ...(statusFilter === "all" ? {} : { status: statusFilter.toUpperCase() as ProductStatus }),
    ...(searchQuery ?
    {
      OR: [
      { name: { contains: searchQuery, mode: "insensitive" } },
      { slug: { contains: searchQuery, mode: "insensitive" } },
      { sku: { contains: searchQuery, mode: "insensitive" } },
      { summary: { contains: searchQuery, mode: "insensitive" } }]

    } :
    {})
  };

  const [products, productCount, activeCount, collections, giftCards] = await Promise.all([
  prisma.product.findMany({
    where: productWhere,
    include: {
      variants: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
      collectionProducts: {
        include: { collection: true },
        orderBy: { createdAt: "asc" }
      }
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize
  }),
  prisma.product.count({ where: productWhere }),
  prisma.product.count({ where: { siteId: settings.siteId, status: ProductStatus.ACTIVE } }),
  prisma.collection.findMany({ where: { siteId: settings.siteId }, orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { name: "asc" }] }),
  prisma.giftCard.findMany({ where: { siteId: settings.siteId }, orderBy: { createdAt: "desc" }, take: 12 })]
  );
  const pageCount = Math.max(1, Math.ceil(productCount / pageSize));
  const rangeStart = productCount ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(productCount, page * pageSize);
  const savedMessage = params.saved ? "Commerce changes saved." : null;
  const errorMessage = params.error || null;
  const addProductForm = (
    <form action={createProductAction} className="form-grid">
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" required />
        </div>
        <div className="ui-field">
          <label htmlFor="slug">Shop URL slug</label>
          <input id="slug" name="slug" placeholder="starter-package" />
        </div>
      </EqualGrid>
      <EqualGrid min="220px">
        <div className="ui-field">
          <label htmlFor="type">Type</label>
          <select id="type" name="type" defaultValue={ProductType.PHYSICAL}>
            {Object.values(ProductType).map((type) =>
            <option key={type} value={type}>
                {enumLabel(type)}
              </option>
            )}
          </select>
        </div>
        <div className="ui-field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={ProductStatus.DRAFT}>
            {Object.values(ProductStatus).map((status) =>
            <option key={status} value={status}>
                {status.toLowerCase()}
              </option>
            )}
          </select>
        </div>
        <div className="ui-field">
          <label htmlFor="currency">Currency</label>
          <input id="currency" name="currency" defaultValue="USD" maxLength={3} required />
        </div>
      </EqualGrid>
      <EqualGrid min="220px">
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
      </EqualGrid>
      <div className="ui-field">
        <label htmlFor="summary">Summary</label>
        <input id="summary" name="summary" />
      </div>
      <div className="ui-field">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" />
      </div>
      <EqualGrid>
        <div className="ui-field">
          <label htmlFor="imageUrl">Image URL</label>
          <input id="imageUrl" name="imageUrl" placeholder="/hero.svg" />
        </div>
        <div className="ui-field">
          <label htmlFor="tags">Tags</label>
          <input id="tags" name="tags" placeholder="package, featured" />
        </div>
      </EqualGrid>
      <EqualGrid>
        <label className="ui-zero">
          <input name="trackInventory" type="checkbox" />
          Track default variant inventory
        </label>
        <div className="ui-field">
          <label htmlFor="inventoryQuantity">Inventory quantity</label>
          <input id="inventoryQuantity" name="inventoryQuantity" min="0" type="number" />
        </div>
      </EqualGrid>
      <p className="lead lead-compact">
        Inventory is governed per variant. This product-level value seeds and mirrors the default variant.
      </p>
      <div className="module-modal-actions">
        <Button type="submit">
          <PackagePlus size={18} />
          Add product
        </Button>
      </div>
    </form>
  );

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Products</p>
          <h1>Commerce catalog</h1>
          <p>Manage products, variants, collections, and gift cards.</p>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <EqualGrid as="section" min="220px">
        <Card>
          <PackagePlus size={22} />
          <h3>{activeCount} active products</h3>
          <p className="lead lead-compact">
            Items available to the public storefront and cart.
          </p>
        </Card>
        <Card>
          <Boxes size={22} />
          <h3>{collections.length} collections</h3>
          <p className="lead lead-compact">
            Group products for shops, galleries, packages, and featured blocks.
          </p>
        </Card>
      </EqualGrid>

      <section aria-labelledby="products-table-title" className="ui-data-table-shell products-data-table">
        <div className="ui-data-table-header">
          <div className="ui-data-table-titlebar">
            <div>
              <h2 className="section-title" id="products-table-title">
                Catalog list
              </h2>
              <p className="ui-zero">
                {rangeStart}-{rangeEnd} of {productCount}
                {searchQuery ? ` matching "${searchQuery}"` : " matching products"}
              </p>
            </div>
            <ModuleActionModals
              items={[
                {
                  content: addProductForm,
                  icon: "package",
                  id: "product",
                  label: "Product",
                  title: "Add product"
                }
              ]}
              toolbarLabel="Catalog tools"
            />
          </div>

          <div className="ui-data-table-toolbar">
            <form action="/admin/modules/products" className="ui-compact-search ui-data-table-search">
              {statusFilter !== "all" ? <input type="hidden" name="status" value={statusFilter} /> : null}
              <input aria-label="Search products" id="products-search" name="q" placeholder="Search products" defaultValue={searchQuery} />
              <Button size="sm" type="submit" variant="secondary">
                <Search size={15} />
                Search
              </Button>
              {searchQuery ?
              <ButtonAnchor href={productsHref({ status: statusFilter })} size="sm" variant="ghost">
                  Clear
                </ButtonAnchor> :
              null}
            </form>
          </div>

          <nav aria-label="Product status filters" className="ui-data-table-tabs products-status-tabs">
            {statusFilters.map((filter) =>
            <a className={filter === statusFilter ? "ui-data-table-tab is-active" : "ui-data-table-tab"} href={productsHref({ q: searchQuery, status: filter })} key={filter}>
                {filter}
              </a>
            )}
          </nav>
        </div>

        <Table className="ui-data-table-scroll products-table-wrap" tableClassName="ui-data-table ui-table-sticky-actions products-index-table">
          <colgroup>
            <col className="products-col-product" />
            <col className="products-col-status" />
            <col className="products-col-inventory" />
            <col className="products-col-type" />
            <col className="products-col-collections" />
            <col className="products-col-price" />
            <col className="products-col-actions" />
          </colgroup>
            <thead>
              <tr>
                <th>Product</th>
                <th>Status</th>
                <th>Inventory</th>
                <th>Type</th>
                <th>Collections</th>
                <th>Price</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const defaultVariant = product.variants[0] || null;
                const variantCount = product.variants.length;
                const collectionsLabel = product.collectionProducts.map(({ collection }) => collection.name).join(", ") || "Unassigned";
                const skuLabel = defaultVariant?.sku || product.sku || "No SKU";
                const variantLabel = `${variantCount} ${variantCount === 1 ? "variant" : "variants"}`;
                const priceCents = defaultVariant?.priceCents ?? product.basePriceCents;

                return (
                  <tr key={product.id}>
                  <td>
                    <div className="ui-object-cell">
                      {product.imageUrl ?
                      <NextImage
                        alt={product.name}
                        className="ui-object-thumb"
                        height={40}
                        src={product.imageUrl}
                        unoptimized
                        width={40} /> :

                      <span aria-hidden="true" className="ui-object-thumb ui-object-thumb-empty">
                          <ImageIcon size={16} />
                        </span>
                      }
                      <span className="ui-object-copy">
                        <strong className="ui-truncate" title={product.name}>{product.name}</strong>
                        <span className="ui-object-meta ui-truncate" title={`/shop/${product.slug} - ${skuLabel} - ${variantLabel}`}>
                          /shop/{product.slug} · {skuLabel} · {variantLabel}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={productStatusClass(product.status)}>{product.status.toLowerCase()}</span>
                  </td>
                  <td>{productInventoryLabel(product)}</td>
                  <td>{enumLabel(product.type)}</td>
                  <td>
                    <span className="ui-truncate" title={collectionsLabel}>{collectionsLabel}</span>
                  </td>
                  <td>
                    <span className="ui-truncate">{formatMoney(priceCents, product.currency)}</span>
                  </td>
                  <td>
                    <div className="ui-data-table-row-actions">
                      <ButtonAnchor href={`/admin/modules/products/${product.id}`} size="sm" variant="secondary">
                        Edit
                      </ButtonAnchor>
                      <form action={updateProductStatusAction} className="ui-inline-form">
                        <input type="hidden" name="id" value={product.id} />
                        <input
                        type="hidden"
                        name="status"
                        value={product.status === ProductStatus.ACTIVE ? ProductStatus.DRAFT : ProductStatus.ACTIVE} />
                      
                        <Button size="sm" type="submit" variant="secondary">
                          {product.status === ProductStatus.ACTIVE ? "Draft" : "Activate"}
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>);

              })}
              {!products.length ?
              <tr>
                  <td className="ui-data-table-empty" colSpan={7}>No products yet.</td>
                </tr> :
              null}
            </tbody>
          </Table>
        <div className="ui-data-table-footer">
          <Pagination
            label="Product pages"
            nextHref={productsHref({ page: Math.min(pageCount, page + 1), q: searchQuery, status: statusFilter })}
            page={page}
            pageCount={pageCount}
            previousHref={productsHref({ page: Math.max(1, page - 1), q: searchQuery, status: statusFilter })}
          />
        </div>
      </section>

      <EqualGrid as="section">
        <Card bodyClassName="ui-stack">
          <h2 className="section-title">Collections</h2>
          <form action={createCollectionAction} className="subpanel form-grid">
            <EqualGrid>
              <div className="ui-field">
                <label htmlFor="collectionName">Name</label>
                <input id="collectionName" name="name" required />
              </div>
              <div className="ui-field">
                <label htmlFor="collectionSlug">Slug</label>
                <input id="collectionSlug" name="slug" />
              </div>
            </EqualGrid>
            <EqualGrid min="220px">
              <div className="ui-field">
                <label htmlFor="collectionStatus">Status</label>
                <select id="collectionStatus" name="status" defaultValue={ProductStatus.DRAFT}>
                  {Object.values(ProductStatus).map((status) =>
                  <option key={status} value={status}>
                      {status.toLowerCase()}
                    </option>
                  )}
                </select>
              </div>
              <div className="ui-field">
                <label htmlFor="sortOrder">Sort order</label>
                <input id="sortOrder" name="sortOrder" type="number" defaultValue="0" />
              </div>
              <label className="ui-zero">
                <input name="isFeatured" type="checkbox" />
                Featured
              </label>
            </EqualGrid>
            <div className="ui-field">
              <label htmlFor="collectionDescription">Description</label>
              <textarea id="collectionDescription" name="description" />
            </div>
            <Button type="submit" variant="secondary">
              <Tags size={18} />
              Add collection
            </Button>
          </form>
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Featured</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((collection) =>
              <tr key={collection.id}>
                  <td>
                    <strong>{collection.name}</strong>
                    <br />
                    <span className="muted-text">/shop/collections/{collection.slug}</span>
                  </td>
                  <td>
                    <span className={productStatusClass(collection.status)}>{collection.status.toLowerCase()}</span>
                  </td>
                  <td>{collection.isFeatured ? "yes" : "no"}</td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>

        <Card bodyClassName="ui-stack">
          <h2 className="section-title">Gift cards</h2>
          <div className="subpanel form-grid">
            <h3 className="subsection-title">Issue gift card</h3>
            <form action={createGiftCardAction} className="form-grid">
              <EqualGrid min="220px">
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
              </EqualGrid>
              <EqualGrid>
                <div className="ui-field">
                  <label htmlFor="giftCardRecipientName">Recipient name</label>
                  <input id="giftCardRecipientName" name="recipientName" />
                </div>
                <div className="ui-field">
                  <label htmlFor="giftCardRecipientEmail">Recipient email</label>
                  <input id="giftCardRecipientEmail" name="recipientEmail" type="email" />
                </div>
              </EqualGrid>
              <EqualGrid>
                <div className="ui-field">
                  <label htmlFor="giftCardPurchaserName">Purchaser name</label>
                  <input id="giftCardPurchaserName" name="purchaserName" />
                </div>
                <div className="ui-field">
                  <label htmlFor="giftCardPurchaserEmail">Purchaser email</label>
                  <input id="giftCardPurchaserEmail" name="purchaserEmail" type="email" />
                </div>
              </EqualGrid>
              <EqualGrid>
                <div className="ui-field">
                  <label htmlFor="giftCardExpiresAt">Expires</label>
                  <input id="giftCardExpiresAt" name="expiresAt" type="date" />
                </div>
                <div className="ui-field">
                  <label htmlFor="giftCardNote">Note</label>
                  <input id="giftCardNote" name="note" />
                </div>
              </EqualGrid>
              <Button type="submit" variant="secondary">
                Issue gift card
              </Button>
            </form>
          </div>

          <Table>
            <thead>
              <tr>
                <th>Gift card</th>
                <th>Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {giftCards.map((giftCard) =>
              <tr key={giftCard.id}>
                  <td>
                    <strong>{giftCard.code}</strong>
                    <br />
                    <span className="muted-text">
                      {giftCard.recipientEmail || giftCard.recipientName || "No recipient"}
                    </span>
                  </td>
                  <td>
                    {formatMoney(giftCard.balanceCents, giftCard.currency)}
                    <br />
                    <span className="muted-text">of {formatMoney(giftCard.initialAmountCents, giftCard.currency)}</span>
                  </td>
                  <td>
                    <span className={giftCard.status === GiftCardStatus.ACTIVE ? "ui-badge ui-badge-success" : "ui-badge ui-badge-danger"}>
                      {enumLabel(giftCard.status)}
                    </span>
                  </td>
                </tr>
              )}
              {!giftCards.length ?
              <tr>
                  <td colSpan={3}>No gift cards yet.</td>
                </tr> :
              null}
            </tbody>
          </Table>
        </Card>
      </EqualGrid>
    </div>);

}
