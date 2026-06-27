import NextImage from "next/image";
import { CartStatus, CouponType, GiftCardStatus, OrderStatus, PaymentStatus, Prisma, ProductStatus, ProductType } from "@prisma/client";
import { BadgeDollarSign, Boxes, CreditCard, Download, ImageIcon, PackagePlus, ReceiptText, Search, Tags, Truck } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { nextOrderStatuses } from "@/lib/commerce/orders";
import { enumLabel, formatDateTime, formatMoney, stringArrayCsv } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import {
  addProductToCollectionAction,
  clearCommerceOrderCheckoutLinkAction,
  createCollectionAction,
  createCouponAction,
  createGiftCardAction,
  createProductAction,
  createProductVariantAction,
  fulfillCommerceOrderAction,
  markCommerceOrderFulfillmentExportedAction,
  recordCommerceOrderPrintLabHandoffAction,
  updateCommerceCheckoutSettingsAction,
  setCommerceOrderCheckoutLinkAction,
  refundCommercePaymentAction,
  updateCommerceOrderStatusAction,
  updateProductAction,
  updateProductStatusAction } from "./actions";
import { Button, ButtonAnchor, ButtonLink, Card, EqualGrid, Pagination, Table } from "@/components/ui";
import { ModuleActionModals } from "@/components/ui/module-action-modals";

export const dynamic = "force-dynamic";

const pageSize = 50;
const statusFilters = ["all", ...Object.values(ProductStatus).map((status) => status.toLowerCase())] as const;

type ProductsPageProps = {
  searchParams: Promise<{saved?: string;error?: string;page?: string;status?: string;product?: string;order?: string;q?: string;}>;
};

function normalizeStatusFilter(value?: string) {
  return statusFilters.includes(value as (typeof statusFilters)[number]) ? value || "all" : "all";
}

function moneyInput(cents?: number | null) {
  return typeof cents === "number" ? (cents / 100).toFixed(2) : "";
}

function percentInput(basisPoints?: number | null) {
  return typeof basisPoints === "number" ? (basisPoints / 100).toFixed(2) : "";
}

function productStatusClass(status: ProductStatus) {
  if (status === ProductStatus.ACTIVE) return "ui-badge ui-badge-success";
  if (status === ProductStatus.ARCHIVED) return "ui-badge ui-badge-danger";
  return "ui-badge";
}

function orderStatusClass(status: OrderStatus) {
  if (status === OrderStatus.PAID || status === OrderStatus.FULFILLED) return "ui-badge ui-badge-success";
  if (status === OrderStatus.CANCELED || status === OrderStatus.REFUNDED) return "ui-badge ui-badge-danger";
  return "ui-badge";
}

function currencyTotalsLabel(totals: {currency: string;_sum: {totalCents: number | null;};}[]) {
  if (!totals.length) return formatMoney(0);
  return totals.map((row) => formatMoney(row._sum.totalCents || 0, row.currency)).join(" / ");
}

function productsHref({
  page,
  product,
  q,
  status
}: {
  page?: number;
  product?: string;
  q?: string;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (q) params.set("q", q);
  if (page && page > 1) params.set("page", String(page));
  if (product) params.set("product", product);
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

function refundablePaymentCents(payment: {amountCents: number;refundedCents: number;status: PaymentStatus;}) {
  if (payment.status !== PaymentStatus.PAID && payment.status !== PaymentStatus.AUTHORIZED) return 0;
  return Math.max(0, payment.amountCents - payment.refundedCents);
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

  const [products, productCount, activeCount, collections, coupons, giftCards, orderCount, paidOrderTotals, openCartCount, orders] = await Promise.all([
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
  prisma.coupon.findMany({ where: { siteId: settings.siteId }, orderBy: { createdAt: "desc" }, take: 12 }),
  prisma.giftCard.findMany({ where: { siteId: settings.siteId }, orderBy: { createdAt: "desc" }, take: 12 }),
  prisma.order.count({ where: { siteId: settings.siteId } }),
  prisma.order.groupBy({
    by: ["currency"],
    where: { siteId: settings.siteId, status: { in: [OrderStatus.PAID, OrderStatus.FULFILLED] } },
    _sum: { totalCents: true }
  }),
  prisma.cart.count({ where: { siteId: settings.siteId, status: CartStatus.OPEN } }),
  prisma.order.findMany({
    where: { siteId: settings.siteId },
    include: {
      client: true,
      payments: { orderBy: { createdAt: "desc" }, take: 2 },
      _count: { select: { items: true } }
    },
    orderBy: { updatedAt: "desc" },
    take: 25
  })]
  );
  const pageCount = Math.max(1, Math.ceil(productCount / pageSize));
  const rangeStart = productCount ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(productCount, page * pageSize);
  const selectedProduct = products.find((product) => product.id === params.product) || products[0];
  const selectedOrderId = params.order || orders[0]?.id;
  const selectedOrder = selectedOrderId ?
  await prisma.order.findFirst({
    where: { id: selectedOrderId, siteId: settings.siteId },
    include: {
      client: true,
      giftCard: true,
      items: {
        include: {
          product: true,
          variant: true
        },
        orderBy: { createdAt: "asc" }
      },
      payments: { orderBy: { createdAt: "desc" } }
    }
  }) :
  null;
  const selectedOrderNextStatuses = selectedOrder ? nextOrderStatuses(selectedOrder.status) : [];
  const selectedOrderHasPhysicalItems = selectedOrder?.items.some((item) => item.product.type === ProductType.PHYSICAL) ?? false;
  const selectedOrderCanFulfill = Boolean(selectedOrder && selectedOrder.status === OrderStatus.PAID && selectedOrderHasPhysicalItems);
  const selectedOrderCanMarkFulfillmentExported = Boolean(selectedOrder && selectedOrder.status === OrderStatus.PAID && selectedOrderHasPhysicalItems);
  const selectedOrderCanRecordPrintLabHandoff = Boolean(
    selectedOrder && (selectedOrder.status === OrderStatus.PAID || selectedOrder.status === OrderStatus.FULFILLED) && selectedOrderHasPhysicalItems
  );
  const savedMessage = params.saved ? "Commerce changes saved." : null;
  const errorMessage = params.error || null;
  const checkoutTotalsForm = (
    <form action={updateCommerceCheckoutSettingsAction} className="form-grid">
      <p className="lead lead-compact">
        Configure the per-site tax rule and standard shipping option used by cart, orders, and hosted checkout.
      </p>
      <EqualGrid>
        <div className="subpanel form-grid">
          <h3 className="subsection-title">Tax</h3>
          <label className="ui-zero">
            <input name="commerceTaxEnabled" type="checkbox" defaultChecked={settings.commerceTaxEnabled} />
            Enable tax
          </label>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="commerceTaxLabel">Tax label</label>
              <input id="commerceTaxLabel" name="commerceTaxLabel" defaultValue={settings.commerceTaxLabel} required />
            </div>
            <div className="ui-field">
              <label htmlFor="commerceTaxRate">Tax rate %</label>
              <input id="commerceTaxRate" name="commerceTaxRate" inputMode="decimal" defaultValue={percentInput(settings.commerceTaxRateBps)} />
            </div>
          </EqualGrid>
          <label className="ui-zero">
            <input name="commerceTaxAppliesToShipping" type="checkbox" defaultChecked={settings.commerceTaxAppliesToShipping} />
            Tax shipping
          </label>
        </div>

        <div className="subpanel form-grid">
          <h3 className="subsection-title">Shipping</h3>
          <label className="ui-zero">
            <input name="commerceShippingEnabled" type="checkbox" defaultChecked={settings.commerceShippingEnabled} />
            Enable standard shipping
          </label>
          <EqualGrid>
            <div className="ui-field">
              <label htmlFor="commerceShippingLabel">Shipping label</label>
              <input id="commerceShippingLabel" name="commerceShippingLabel" defaultValue={settings.commerceShippingLabel} required />
            </div>
            <div className="ui-field">
              <label htmlFor="commerceShippingFlat">Flat amount</label>
              <input
                id="commerceShippingFlat"
                name="commerceShippingFlat"
                inputMode="decimal"
                defaultValue={moneyInput(settings.commerceShippingFlatCents)} />
            </div>
          </EqualGrid>
          <div className="ui-field">
            <label htmlFor="commerceFreeShippingThreshold">Free shipping threshold</label>
            <input
              id="commerceFreeShippingThreshold"
              name="commerceFreeShippingThreshold"
              inputMode="decimal"
              defaultValue={moneyInput(settings.commerceFreeShippingThresholdCents)} />
          </div>
        </div>
      </EqualGrid>
      <div className="module-modal-actions">
        <Button type="submit">
          Save checkout totals
        </Button>
      </div>
    </form>
  );
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
          <p>Manage products, variants, collections, coupons, orders, and checkout status.</p>
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
        <Card>
          <BadgeDollarSign size={22} />
          <h3>{currencyTotalsLabel(paidOrderTotals)}</h3>
          <p className="lead lead-compact">
            Paid and fulfilled total across {orderCount} order records and {openCartCount} open carts.
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
                },
                {
                  content: checkoutTotalsForm,
                  icon: "receipt",
                  id: "checkout",
                  label: "Checkout totals",
                  title: "Checkout totals"
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
                      <ButtonAnchor href={productsHref({ page, product: product.id, q: searchQuery, status: statusFilter })} size="sm" variant="secondary">
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

      {selectedProduct ?
      <EqualGrid as="section">
          <Card action={updateProductAction} as="form" minHeight="none" bodyClassName="form-grid">
            <h2 className="section-title">Edit selected product</h2>
            <input type="hidden" name="id" value={selectedProduct.id} />
            <EqualGrid>
              <div className="ui-field">
                <label htmlFor={`product-${selectedProduct.id}-name`}>Name</label>
                <input id={`product-${selectedProduct.id}-name`} name="name" defaultValue={selectedProduct.name} required />
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${selectedProduct.id}-slug`}>Shop URL slug</label>
                <input id={`product-${selectedProduct.id}-slug`} name="slug" defaultValue={selectedProduct.slug} />
              </div>
            </EqualGrid>
            <EqualGrid min="220px">
              <div className="ui-field">
                <label htmlFor={`product-${selectedProduct.id}-type`}>Type</label>
                <select id={`product-${selectedProduct.id}-type`} name="type" defaultValue={selectedProduct.type}>
                  {Object.values(ProductType).map((type) =>
                <option key={type} value={type}>
                      {enumLabel(type)}
                    </option>
                )}
                </select>
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${selectedProduct.id}-status`}>Status</label>
                <select id={`product-${selectedProduct.id}-status`} name="status" defaultValue={selectedProduct.status}>
                  {Object.values(ProductStatus).map((status) =>
                <option key={status} value={status}>
                      {status.toLowerCase()}
                    </option>
                )}
                </select>
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${selectedProduct.id}-currency`}>Currency</label>
                <input id={`product-${selectedProduct.id}-currency`} name="currency" defaultValue={selectedProduct.currency} maxLength={3} required />
              </div>
            </EqualGrid>
            <EqualGrid min="220px">
              <div className="ui-field">
                <label htmlFor={`product-${selectedProduct.id}-base-price`}>Price</label>
                <input id={`product-${selectedProduct.id}-base-price`} name="basePrice" defaultValue={moneyInput(selectedProduct.basePriceCents)} required />
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${selectedProduct.id}-compare-price`}>Compare-at price</label>
                <input id={`product-${selectedProduct.id}-compare-price`} name="compareAtPrice" defaultValue={moneyInput(selectedProduct.compareAtPriceCents)} />
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${selectedProduct.id}-sku`}>SKU</label>
                <input id={`product-${selectedProduct.id}-sku`} name="sku" defaultValue={selectedProduct.sku || ""} />
              </div>
            </EqualGrid>
            <div className="ui-field">
              <label htmlFor={`product-${selectedProduct.id}-summary`}>Summary</label>
              <input id={`product-${selectedProduct.id}-summary`} name="summary" defaultValue={selectedProduct.summary} />
            </div>
            <div className="ui-field">
              <label htmlFor={`product-${selectedProduct.id}-description`}>Description</label>
              <textarea id={`product-${selectedProduct.id}-description`} name="description" defaultValue={selectedProduct.description} />
            </div>
            <EqualGrid>
              <div className="ui-field">
                <label htmlFor={`product-${selectedProduct.id}-image`}>Image URL</label>
                <input id={`product-${selectedProduct.id}-image`} name="imageUrl" defaultValue={selectedProduct.imageUrl} />
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${selectedProduct.id}-tags`}>Tags</label>
                <input id={`product-${selectedProduct.id}-tags`} name="tags" defaultValue={stringArrayCsv(selectedProduct.tags)} />
              </div>
            </EqualGrid>
            <EqualGrid>
              <label className="ui-zero">
                <input name="trackInventory" type="checkbox" defaultChecked={selectedProduct.trackInventory} />
                Track default variant inventory
              </label>
              <div className="ui-field">
                <label htmlFor={`product-${selectedProduct.id}-inventory`}>Inventory quantity</label>
                <input
                id={`product-${selectedProduct.id}-inventory`}
                name="inventoryQuantity"
                min="0"
                type="number"
                defaultValue={selectedProduct.inventoryQuantity ?? ""} />
              
              </div>
            </EqualGrid>
            <p className="lead lead-compact">
              Inventory is governed per variant. Saving this product syncs price, status, SKU, and inventory to the default variant.
            </p>
            <Button type="submit">
              Save product
            </Button>
          </Card>

          <Card bodyClassName="ui-stack">
            <div>
              <h2 className="section-title">Variants for {selectedProduct.name}</h2>
              <p className="ui-zero">Variants let the same product support sizes, packages, print formats, or add-on choices.</p>
            </div>
            <Table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Option</th>
                  <th>Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {selectedProduct.variants.map((variant) =>
              <tr key={variant.id}>
                    <td>
                      <strong>{variant.name}</strong>
                      <br />
                      <span className="muted-text">{variant.sku || "No SKU"}</span>
                    </td>
                    <td>
                      {variant.optionName || "Default"}
                      {variant.optionValue ? `: ${variant.optionValue}` : ""}
                    </td>
                    <td>{formatMoney(variant.priceCents ?? selectedProduct.basePriceCents, selectedProduct.currency)}</td>
                    <td>
                      <span className={variant.isActive ? "ui-badge ui-badge-success" : "ui-badge ui-badge-danger"}>{variant.isActive ? "active" : "inactive"}</span>
                    </td>
                  </tr>
              )}
              </tbody>
            </Table>
            <form action={createProductVariantAction} className="subpanel form-grid">
              <input type="hidden" name="productId" value={selectedProduct.id} />
              <h3 className="subsection-title">Add variant</h3>
              <EqualGrid>
                <div className="ui-field">
                  <label htmlFor="variantName">Name</label>
                  <input id="variantName" name="name" placeholder="Large print" required />
                </div>
                <div className="ui-field">
                  <label htmlFor="variantSku">SKU</label>
                  <input id="variantSku" name="sku" />
                </div>
              </EqualGrid>
              <EqualGrid>
                <div className="ui-field">
                  <label htmlFor="optionName">Option name</label>
                  <input id="optionName" name="optionName" placeholder="Size" />
                </div>
                <div className="ui-field">
                  <label htmlFor="optionValue">Option value</label>
                  <input id="optionValue" name="optionValue" placeholder="16x20" />
                </div>
              </EqualGrid>
              <EqualGrid min="220px">
                <div className="ui-field">
                  <label htmlFor="variantPrice">Price override</label>
                  <input id="variantPrice" name="price" inputMode="decimal" />
                </div>
                <div className="ui-field">
                  <label htmlFor="variantCompareAt">Compare-at price</label>
                  <input id="variantCompareAt" name="compareAtPrice" inputMode="decimal" />
                </div>
                <div className="ui-field">
                  <label htmlFor="variantInventory">Inventory quantity</label>
                  <input id="variantInventory" name="inventoryQuantity" min="0" type="number" />
                </div>
              </EqualGrid>
              <div className="ui-zero">
                <label className="ui-zero">
                  <input name="trackInventory" type="checkbox" />
                  Track inventory
                </label>
                <label className="ui-zero">
                  <input name="isDefault" type="checkbox" />
                  Default
                </label>
                <label className="ui-zero">
                  <input name="isActive" type="checkbox" defaultChecked />
                  Active
                </label>
              </div>
              <Button type="submit" variant="secondary">
                Add variant
              </Button>
            </form>
          </Card>
        </EqualGrid> :
      null}

      <EqualGrid as="section">
        <Card bodyClassName="ui-stack">
          <div className="page-header compact-header">
            <div>
              <h2 className="section-title">Orders and payments</h2>
              <p>{orders.length} recent orders from storefront cart checkout prep.</p>
            </div>
            <div className="ui-zero">
              <ButtonLink href="/admin/modules/products/fulfillment-export" variant="secondary">
                <Download size={18} />
                Export fulfillment CSV
              </ButtonLink>
              <ButtonLink href="/admin/modules/products/fulfillment-export?unexportedOnly=1" variant="secondary">
                <Download size={18} />
                Export new orders only
              </ButtonLink>
            </div>
          </div>
          <Table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Total</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) =>
              <tr key={order.id}>
                  <td>
                    <a href={`/admin/modules/products?order=${order.id}`}>
                      <strong>{order.orderNumber}</strong>
                    </a>
                    <br />
                    <span className="muted-text">
                      {order._count.items} items - {formatDateTime(order.placedAt || order.createdAt)}
                    </span>
                  </td>
                  <td>
                    <strong>{order.customerName}</strong>
                    <br />
                    <span className="muted-text">{order.customerEmail}</span>
                  </td>
                  <td>{formatMoney(order.totalCents, order.currency)}</td>
                  <td>
                    <span className={orderStatusClass(order.status)}>{enumLabel(order.status)}</span>
                  </td>
                </tr>
              )}
              {!orders.length ?
              <tr>
                  <td colSpan={4}>No orders yet.</td>
                </tr> :
              null}
            </tbody>
          </Table>
        </Card>

        {selectedOrder ?
        <Card bodyClassName="ui-stack">
            <div className="page-header compact-header">
              <div>
                <h2 className="section-title">{selectedOrder.orderNumber}</h2>
                <p>
                  {selectedOrder.customerName} - {selectedOrder.customerEmail}
                </p>
              </div>
              <span className={orderStatusClass(selectedOrder.status)}>{enumLabel(selectedOrder.status)}</span>
            </div>

            <Table>
              <tbody>
                <tr>
                  <td>Subtotal</td>
                  <td>{formatMoney(selectedOrder.subtotalCents, selectedOrder.currency)}</td>
                </tr>
                <tr>
                  <td>Discount</td>
                  <td>{formatMoney(selectedOrder.discountCents, selectedOrder.currency)}</td>
                </tr>
                <tr>
                  <td>Tax</td>
                  <td>{formatMoney(selectedOrder.taxCents, selectedOrder.currency)}</td>
                </tr>
                <tr>
                  <td>Shipping</td>
                  <td>{formatMoney(selectedOrder.shippingCents, selectedOrder.currency)}</td>
                </tr>
                <tr>
                  <td>Gift card</td>
                  <td>
                    -{formatMoney(selectedOrder.giftCardCreditCents, selectedOrder.currency)}
                    {selectedOrder.giftCard ?
                  <>
                        <br />
                        <span className="muted-text">{selectedOrder.giftCard.code}</span>
                      </> :
                  null}
                  </td>
                </tr>
                <tr>
                  <td>Total</td>
                  <td>
                    <strong>{formatMoney(selectedOrder.totalCents, selectedOrder.currency)}</strong>
                  </td>
                </tr>
                <tr>
                  <td>Client</td>
                  <td>
                    {selectedOrder.client ?
                  <a href={`/admin/clients/${selectedOrder.client.id}`}>{selectedOrder.client.name}</a> :

                  "No linked client"
                  }
                  </td>
                </tr>
              </tbody>
            </Table>

            <div className="ui-zero">
              {selectedOrderNextStatuses.filter((status) => status !== OrderStatus.FULFILLED).map((status) =>
            <form action={updateCommerceOrderStatusAction} key={status}>
                  <input type="hidden" name="id" value={selectedOrder.id} />
                  <input type="hidden" name="status" value={status} />
                  <Button type="submit" variant="secondary">
                    Mark {enumLabel(status)}
                  </Button>
                </form>
            )}
              {!selectedOrderNextStatuses.filter((status) => status !== OrderStatus.FULFILLED).length && !selectedOrderCanFulfill ?
            <span className="ui-badge">Final state</span> :
            null}
            </div>

            <div className="subpanel form-grid">
              <div className="page-header flush-header">
                <div>
                  <h3 className="subsection-title">Fulfillment export and print lab</h3>
                  <p>
                    {selectedOrderHasPhysicalItems ?
                  "Track CSV handoff batches and print lab references for physical items." :
                  "No physical products need fulfillment export or lab handoff."}
                  </p>
                </div>
                <Boxes size={22} />
              </div>
              {selectedOrderHasPhysicalItems ?
            <Table>
                  <tbody>
                    <tr>
                      <td>Exported</td>
                      <td>
                        {selectedOrder.fulfillmentExportedAt ?
                    formatDateTime(selectedOrder.fulfillmentExportedAt, settings.timezone) :
                    "Not marked exported"}
                      </td>
                    </tr>
                    <tr>
                      <td>Export batch</td>
                      <td>{selectedOrder.fulfillmentExportBatch || "Not recorded"}</td>
                    </tr>
                    <tr>
                      <td>Print lab</td>
                      <td>{selectedOrder.printLabName || "Not recorded"}</td>
                    </tr>
                    <tr>
                      <td>Lab reference</td>
                      <td>{selectedOrder.printLabReference || "Not recorded"}</td>
                    </tr>
                    <tr>
                      <td>Lab handoff</td>
                      <td>
                        {selectedOrder.printLabHandoffAt ?
                    formatDateTime(selectedOrder.printLabHandoffAt, settings.timezone) :
                    "Not handed off"}
                      </td>
                    </tr>
                  </tbody>
                </Table> :
            null}
              {selectedOrderCanMarkFulfillmentExported ?
            <form action={markCommerceOrderFulfillmentExportedAction} className="form-grid">
                  <input type="hidden" name="id" value={selectedOrder.id} />
                  <div className="ui-field">
                    <label htmlFor={`order-${selectedOrder.id}-export-batch`}>Export batch</label>
                    <input
                  id={`order-${selectedOrder.id}-export-batch`}
                  name="exportBatch"
                  placeholder="Batch, vendor job, or CSV reference"
                  defaultValue={selectedOrder.fulfillmentExportBatch} />
                
                  </div>
                  <Button type="submit" variant="secondary">
                    <Download size={18} />
                    Mark exported
                  </Button>
                </form> :
            null}
              {selectedOrderCanRecordPrintLabHandoff ?
            <form action={recordCommerceOrderPrintLabHandoffAction} className="form-grid">
                  <input type="hidden" name="id" value={selectedOrder.id} />
                  <EqualGrid>
                    <div className="ui-field">
                      <label htmlFor={`order-${selectedOrder.id}-lab-name`}>Print lab</label>
                      <input
                    id={`order-${selectedOrder.id}-lab-name`}
                    name="labName"
                    placeholder="White House Custom Colour"
                    defaultValue={selectedOrder.printLabName}
                    required />
                  
                    </div>
                    <div className="ui-field">
                      <label htmlFor={`order-${selectedOrder.id}-lab-reference`}>Lab reference</label>
                      <input
                    id={`order-${selectedOrder.id}-lab-reference`}
                    name="reference"
                    placeholder="Lab job, PO, or ticket"
                    defaultValue={selectedOrder.printLabReference} />
                  
                    </div>
                  </EqualGrid>
                  <div className="ui-field">
                    <label htmlFor={`order-${selectedOrder.id}-lab-notes`}>Lab notes</label>
                    <textarea
                  id={`order-${selectedOrder.id}-lab-notes`}
                  name="notes"
                  placeholder="Production notes, paper substitutions, or client-specific print instructions."
                  rows={3}
                  defaultValue={selectedOrder.printLabNotes} />
                
                  </div>
                  <Button type="submit" variant="secondary">
                    <Boxes size={18} />
                    Record lab handoff
                  </Button>
                </form> :
            null}
            </div>

            <div className="subpanel form-grid">
              <div className="page-header flush-header">
                <div>
                  <h3 className="subsection-title">Fulfillment</h3>
                  <p>
                    {selectedOrder.fulfilledAt ?
                  `Fulfilled ${formatDateTime(selectedOrder.fulfilledAt, settings.timezone)}` :
                  selectedOrderHasPhysicalItems ?
                  "Add shipment details when the physical order leaves." :
                  "No physical products require shipment."}
                  </p>
                </div>
                <Truck size={22} />
              </div>
              {selectedOrder.fulfilledAt ?
            <Table>
                  <tbody>
                    <tr>
                      <td>Carrier</td>
                      <td>{selectedOrder.fulfillmentCarrier || "Not recorded"}</td>
                    </tr>
                    <tr>
                      <td>Tracking</td>
                      <td>{selectedOrder.fulfillmentTrackingNumber || "Not recorded"}</td>
                    </tr>
                  </tbody>
                </Table> :
            null}
              {selectedOrderCanFulfill ?
            <form action={fulfillCommerceOrderAction} className="form-grid">
                  <input type="hidden" name="id" value={selectedOrder.id} />
                  <EqualGrid>
                    <div className="ui-field">
                      <label htmlFor={`order-${selectedOrder.id}-carrier`}>Carrier</label>
                      <input id={`order-${selectedOrder.id}-carrier`} name="carrier" placeholder="UPS, USPS, FedEx" />
                    </div>
                    <div className="ui-field">
                      <label htmlFor={`order-${selectedOrder.id}-tracking`}>Tracking number</label>
                      <input id={`order-${selectedOrder.id}-tracking`} name="trackingNumber" />
                    </div>
                  </EqualGrid>
                  <Button type="submit">
                    <Truck size={18} />
                    Mark fulfilled
                  </Button>
                </form> :
            null}
            </div>

            <div className="subpanel form-grid">
              <div className="page-header flush-header">
                <div>
                  <h3 className="subsection-title">Hosted checkout</h3>
                  <p>{selectedOrder.checkoutUrl ? "Stripe Checkout link attached." : "No Stripe Checkout link attached."}</p>
                </div>
                {selectedOrder.checkoutUrl ?
              <ButtonAnchor href={selectedOrder.checkoutUrl} target="_blank" rel="noreferrer" variant="secondary">
                    <CreditCard size={18} />
                    Open link
                  </ButtonAnchor> :
              null}
              </div>
              {selectedOrder.status === OrderStatus.DRAFT || selectedOrder.status === OrderStatus.PENDING ?
            <form action={setCommerceOrderCheckoutLinkAction} className="form-grid">
                  <input type="hidden" name="id" value={selectedOrder.id} />
                  <EqualGrid>
                    <div className="ui-field">
                      <label htmlFor={`order-${selectedOrder.id}-checkout`}>Stripe Checkout URL</label>
                      <input
                    id={`order-${selectedOrder.id}-checkout`}
                    name="checkoutUrl"
                    placeholder="https://checkout.stripe.com/..."
                    defaultValue={selectedOrder.checkoutUrl || ""}
                    required />
                  
                    </div>
                    <div className="ui-field">
                      <label htmlFor={`order-${selectedOrder.id}-session`}>Stripe session/reference</label>
                      <input
                    id={`order-${selectedOrder.id}-session`}
                    name="externalCheckoutSession"
                    placeholder="cs_test_..."
                    defaultValue={selectedOrder.payments[0]?.externalCheckoutSession || ""} />
                  
                    </div>
                  </EqualGrid>
                  <Button type="submit" variant="secondary">
                    Save checkout link
                  </Button>
                </form> :
            null}
              {selectedOrder.checkoutUrl && (selectedOrder.status === OrderStatus.DRAFT || selectedOrder.status === OrderStatus.PENDING) ?
            <form action={clearCommerceOrderCheckoutLinkAction} className="form-grid">
                  <input type="hidden" name="id" value={selectedOrder.id} />
                  <label className="ui-zero">
                    <input name="confirmClear" type="checkbox" required />
                    Clear this hosted checkout link.
                  </label>
                  <Button type="submit" variant="danger">
                    Clear checkout link
                  </Button>
                </form> :
            null}
            </div>

            <div className="subpanel">
              <h3 className="subsection-title">Items</h3>
              <Table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map((item) =>
                <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        <br />
                        <span className="muted-text">{item.sku || item.product.sku || "No SKU"}</span>
                      </td>
                      <td>{item.quantity}</td>
                      <td>{formatMoney(item.lineTotalCents, selectedOrder.currency)}</td>
                    </tr>
                )}
                </tbody>
              </Table>
            </div>

            <div className="subpanel">
              <h3 className="subsection-title">Payment records</h3>
              <Table>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Refund</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.payments.map((payment) => {
                  const refundableCents = refundablePaymentCents(payment);

                  return (
                    <tr key={payment.id}>
                        <td>
                          <strong>{enumLabel(payment.provider)}</strong>
                          <br />
                          <span className="muted-text">{payment.externalCheckoutSession || payment.externalPaymentId || "No reference"}</span>
                        </td>
                        <td>{enumLabel(payment.status)}</td>
                        <td>
                          {formatMoney(payment.amountCents, payment.currency)}
                          {payment.refundedCents > 0 ?
                        <>
                              <br />
                              <span className="muted-text">{formatMoney(payment.refundedCents, payment.currency)} refunded</span>
                            </> :
                        null}
                        </td>
                        <td>
                          {refundableCents > 0 ?
                        <form action={refundCommercePaymentAction} className="form-grid ui-zero">
                              <input type="hidden" name="paymentId" value={payment.id} />
                              <div className="ui-field">
                                <label htmlFor={`refund-${payment.id}`}>Amount</label>
                                <input
                              id={`refund-${payment.id}`}
                              name="amount"
                              defaultValue={moneyInput(refundableCents)}
                              inputMode="decimal"
                              required />
                            
                              </div>
                              <Button type="submit" variant="danger">
                                Refund
                              </Button>
                            </form> :

                        <span className="ui-badge">Not refundable</span>
                        }
                        </td>
                      </tr>);

                })}
                  {!selectedOrder.payments.length ?
                <tr>
                      <td colSpan={4}>No payment records yet.</td>
                    </tr> :
                null}
                </tbody>
              </Table>
            </div>
          </Card> :

        <Card>
            <ReceiptText size={22} />
            <h2 className="section-title">No selected order</h2>
            <p className="lead lead-compact">
              Orders appear here after a public cart is prepared for hosted checkout.
            </p>
          </Card>
        }
      </EqualGrid>

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
          {selectedProduct && collections.length ?
          <form action={addProductToCollectionAction} className="subpanel form-grid">
              <input type="hidden" name="productId" value={selectedProduct.id} />
              <div className="ui-field">
                <label htmlFor="collectionId">Add {selectedProduct.name} to collection</label>
                <select id="collectionId" name="collectionId">
                  {collections.map((collection) =>
                <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                )}
                </select>
              </div>
              <Button type="submit" variant="secondary">
                Add to collection
              </Button>
            </form> :
          null}
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
          <h2 className="section-title">Coupons</h2>
          <form action={createCouponAction} className="subpanel form-grid">
            <EqualGrid min="220px">
              <div className="ui-field">
                <label htmlFor="couponCode">Code</label>
                <input id="couponCode" name="code" placeholder="WELCOME10" required />
              </div>
              <div className="ui-field">
                <label htmlFor="couponType">Type</label>
                <select id="couponType" name="type" defaultValue={CouponType.PERCENT}>
                  <option value={CouponType.PERCENT}>percent</option>
                  <option value={CouponType.FIXED}>fixed amount</option>
                </select>
              </div>
              <label className="ui-zero">
                <input name="isActive" type="checkbox" defaultChecked />
                Active
              </label>
            </EqualGrid>
            <EqualGrid min="220px">
              <div className="ui-field">
                <label htmlFor="percentOff">Percent off</label>
                <input id="percentOff" name="percentOff" min="0" max="100" type="number" />
              </div>
              <div className="ui-field">
                <label htmlFor="amount">Fixed amount</label>
                <input id="amount" name="amount" inputMode="decimal" />
              </div>
              <div className="ui-field">
                <label htmlFor="maxRedemptions">Max redemptions</label>
                <input id="maxRedemptions" name="maxRedemptions" min="0" type="number" />
              </div>
            </EqualGrid>
            <Button type="submit" variant="secondary">
              Add coupon
            </Button>
          </form>
          <Table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) =>
              <tr key={coupon.id}>
                  <td>
                    <strong>{coupon.code}</strong>
                    <br />
                    <span className="muted-text">{coupon.redemptionCount} redemptions</span>
                  </td>
                  <td>
                    {coupon.type === CouponType.PERCENT ?
                  `${coupon.percentOff || 0}%` :
                  formatMoney(coupon.amountCents || 0)}
                  </td>
                  <td>
                    <span className={coupon.isActive ? "ui-badge ui-badge-success" : "ui-badge ui-badge-danger"}>{coupon.isActive ? "active" : "inactive"}</span>
                  </td>
                </tr>
              )}
              {!coupons.length ?
              <tr>
                  <td colSpan={3}>No coupons yet.</td>
                </tr> :
              null}
            </tbody>
          </Table>

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
