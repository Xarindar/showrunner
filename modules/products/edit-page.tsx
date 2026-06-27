import NextImage from "next/image";
import { notFound } from "next/navigation";
import { ProductStatus, ProductType } from "@prisma/client";
import { ArrowLeft, ExternalLink, ImageIcon, PackagePlus, Plus, Save, Tags } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { enumLabel, formatMoney, stringArrayCsv } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { Button, ButtonLink, EqualGrid, Table } from "@/components/ui";
import { addProductToCollectionAction, createProductVariantAction, updateProductAction } from "./actions";

type ProductEditPageProps = {
  productId: string;
  searchParams: Promise<{ error?: string; saved?: string }>;
};

function moneyInput(cents?: number | null) {
  return typeof cents === "number" ? (cents / 100).toFixed(2) : "";
}

function productStatusClass(status: ProductStatus) {
  if (status === ProductStatus.ACTIVE) return "ui-badge ui-badge-success";
  if (status === ProductStatus.ARCHIVED) return "ui-badge ui-badge-danger";
  return "ui-badge";
}

function variantInventoryLabel(variant: { inventoryQuantity: number | null; trackInventory: boolean }) {
  if (!variant.trackInventory) return "Not tracked";
  return `${variant.inventoryQuantity ?? 0} in stock`;
}

export default async function ProductEditPage({ productId, searchParams }: ProductEditPageProps) {
  await requireAdmin("products:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const [product, collections] = await Promise.all([
    prisma.product.findFirst({
      where: { id: productId, siteId: settings.siteId },
      include: {
        collectionProducts: {
          include: { collection: true },
          orderBy: { createdAt: "asc" }
        },
        variants: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }
      }
    }),
    prisma.collection.findMany({
      where: { siteId: settings.siteId },
      orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { name: "asc" }]
    })
  ]);

  if (!product) notFound();

  const assignedCollectionIds = new Set(product.collectionProducts.map(({ collectionId }) => collectionId));
  const availableCollections = collections.filter((collection) => !assignedCollectionIds.has(collection.id));
  const savedMessage =
    params.saved === "variant"
      ? "Variant added."
      : params.saved === "collection-product"
        ? "Product added to collection."
        : params.saved
          ? "Product changes saved."
          : null;
  const errorMessage = params.error || null;
  const defaultVariant = product.variants[0] || null;

  return (
    <div className="stack product-editor-page">
      <header className="product-editor-header">
        <div className="product-editor-title">
          <ButtonLink href="/admin/modules/products" size="sm" variant="ghost">
            <ArrowLeft size={16} />
            Products
          </ButtonLink>
          <div>
            <p className="eyebrow">Product editor</p>
            <h1>{product.name}</h1>
          </div>
          <div className="ui-zero">
            <span className={productStatusClass(product.status)}>{product.status.toLowerCase()}</span>
            <span className="ui-badge">{enumLabel(product.type)}</span>
            <span className="ui-badge">{product.variants.length} {product.variants.length === 1 ? "variant" : "variants"}</span>
          </div>
        </div>
        <div className="product-editor-actions">
          {product.status === ProductStatus.ACTIVE ? (
            <ButtonLink href={`/shop/${product.slug}`} rel="noreferrer" size="sm" target="_blank" variant="secondary">
              <ExternalLink size={15} />
              View shop
            </ButtonLink>
          ) : null}
          <Button form="product-editor-form" size="sm" type="submit">
            <Save size={15} />
            Save product
          </Button>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      <form action={updateProductAction} className="product-editor-grid" id="product-editor-form">
        <input type="hidden" name="id" value={product.id} />
        <main className="product-editor-main">
          <section className="product-editor-panel">
            <div className="product-editor-section-head">
              <h2 className="section-title">Details</h2>
            </div>
            <div className="form-grid">
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-name`}>Title</label>
                <input id={`product-${product.id}-name`} name="name" defaultValue={product.name} required />
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-summary`}>Short summary</label>
                <input id={`product-${product.id}-summary`} name="summary" defaultValue={product.summary} />
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-description`}>Description</label>
                <textarea id={`product-${product.id}-description`} name="description" defaultValue={product.description} />
              </div>
            </div>
          </section>

          <section className="product-editor-panel">
            <div className="product-editor-section-head">
              <h2 className="section-title">Media</h2>
            </div>
            <div className="product-editor-media-row">
              {product.imageUrl ? (
                <NextImage alt={product.name} className="product-editor-media-preview" height={160} src={product.imageUrl} unoptimized width={220} />
              ) : (
                <div className="product-editor-media-empty">
                  <ImageIcon size={24} />
                  <span>No shop image</span>
                </div>
              )}
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-image`}>Shop image URL</label>
                <input id={`product-${product.id}-image`} name="imageUrl" defaultValue={product.imageUrl} placeholder="/hero.svg" />
              </div>
            </div>
          </section>

          <section className="product-editor-panel">
            <div className="product-editor-section-head">
              <h2 className="section-title">Pricing</h2>
            </div>
            <EqualGrid min="180px">
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
            </EqualGrid>
          </section>

          <section className="product-editor-panel">
            <div className="product-editor-section-head">
              <h2 className="section-title">Inventory</h2>
            </div>
            <EqualGrid min="180px">
              <label className="ui-check-row">
                <input name="trackInventory" type="checkbox" defaultChecked={product.trackInventory} />
                Track default variant inventory
              </label>
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-inventory`}>Inventory quantity</label>
                <input id={`product-${product.id}-inventory`} name="inventoryQuantity" min="0" type="number" defaultValue={product.inventoryQuantity ?? ""} />
              </div>
            </EqualGrid>
          </section>
        </main>

        <aside className="product-editor-rail">
          <section className="product-editor-panel">
            <div className="product-editor-section-head">
              <h2 className="section-title">Publishing</h2>
            </div>
            <div className="form-grid">
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
                <label htmlFor={`product-${product.id}-currency`}>Currency</label>
                <input id={`product-${product.id}-currency`} name="currency" defaultValue={product.currency} maxLength={3} required />
              </div>
            </div>
          </section>

          <section className="product-editor-panel">
            <div className="product-editor-section-head">
              <h2 className="section-title">Organization</h2>
            </div>
            <div className="form-grid">
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-slug`}>Shop URL slug</label>
                <input id={`product-${product.id}-slug`} name="slug" defaultValue={product.slug} />
              </div>
              <div className="ui-field">
                <label htmlFor={`product-${product.id}-tags`}>Tags</label>
                <input id={`product-${product.id}-tags`} name="tags" defaultValue={stringArrayCsv(product.tags)} placeholder="package, featured" />
              </div>
            </div>
          </section>
        </aside>
      </form>

      <section className="product-editor-panel">
        <div className="product-editor-section-head">
          <div>
            <h2 className="section-title">Variants</h2>
            <p className="ui-zero">Options, pricing overrides, and stock levels for this product.</p>
          </div>
          <span className="ui-badge">{product.variants.length}</span>
        </div>
        <Table tableClassName="product-editor-variants-table">
          <thead>
            <tr>
              <th>Variant</th>
              <th>Option</th>
              <th>Price</th>
              <th>Inventory</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {product.variants.map((variant) => (
              <tr key={variant.id}>
                <td>
                  <strong>{variant.name}</strong>
                  <br />
                  <span className="muted-text">{variant.sku || product.sku || "No SKU"}</span>
                </td>
                <td>
                  {variant.optionName || "Default"}
                  {variant.optionValue ? `: ${variant.optionValue}` : ""}
                  {variant.isDefault ? <span className="ui-badge product-editor-default-badge">Default</span> : null}
                </td>
                <td>{formatMoney(variant.priceCents ?? product.basePriceCents, product.currency)}</td>
                <td>{variantInventoryLabel(variant)}</td>
                <td>
                  <span className={variant.isActive ? "ui-badge ui-badge-success" : "ui-badge ui-badge-danger"}>{variant.isActive ? "active" : "inactive"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>

        <form action={createProductVariantAction} className="product-editor-add-form">
          <input type="hidden" name="productId" value={product.id} />
          <div className="product-editor-section-head">
            <h3 className="subsection-title">Add variant</h3>
            <Button type="submit" variant="secondary">
              <Plus size={16} />
              Add variant
            </Button>
          </div>
          <EqualGrid min="180px">
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
          </EqualGrid>
          <EqualGrid min="180px">
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
          </EqualGrid>
          <div className="product-editor-checks">
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

      <section className="product-editor-panel">
        <div className="product-editor-section-head">
          <div>
            <h2 className="section-title">Collections</h2>
            <p className="ui-zero">Group this product for storefront shelves and featured blocks.</p>
          </div>
          <Tags size={20} />
        </div>
        <div className="product-editor-collection-list">
          {product.collectionProducts.map(({ collection }) => (
            <span className="ui-badge" key={collection.id}>
              {collection.name}
            </span>
          ))}
          {!product.collectionProducts.length ? <span className="muted-text">Not assigned to a collection.</span> : null}
        </div>
        {availableCollections.length ? (
          <form action={addProductToCollectionAction} className="product-editor-add-form product-editor-collection-form">
            <input type="hidden" name="productId" value={product.id} />
            <div className="ui-field">
              <label htmlFor="collectionId">Add to collection</label>
              <select id="collectionId" name="collectionId">
                {availableCollections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="secondary">
              <PackagePlus size={16} />
              Add to collection
            </Button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
