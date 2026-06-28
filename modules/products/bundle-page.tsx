import { notFound } from "next/navigation";
import { ProductStatus } from "@prisma/client";
import { ArrowLeft, Boxes, PackagePlus, Plus, Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { enumLabel } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { Button, ButtonLink } from "@/components/ui";
import { createBundleComponentAction, removeBundleComponentAction } from "./actions";

type ProductBundlePageProps = {
  productId: string;
  searchParams: Promise<{ error?: string; saved?: string }>;
};

function statusClass(status: ProductStatus) {
  if (status === ProductStatus.ACTIVE) return "catalog-status is-active";
  if (status === ProductStatus.ARCHIVED) return "catalog-status is-archived";
  return "catalog-status is-draft";
}

export default async function ProductBundlePage({ productId, searchParams }: ProductBundlePageProps) {
  await requireAdmin("products:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const [product, bundleProducts] = await Promise.all([
    prisma.product.findFirst({
      where: { id: productId, siteId: settings.siteId },
      include: {
        bundleComponents: {
          include: {
            componentProduct: {
              select: { currency: true, id: true, name: true, sku: true, type: true }
            },
            componentVariant: {
              select: { id: true, name: true, sku: true }
            }
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
        }
      }
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

  const savedMessage = params.saved === "bundle" ? "Bundle contents updated." : null;
  const errorMessage = params.error || null;

  return (
    <div className="product-studio-page bundle-flow-page">
      <header className="product-studio-header">
        <div className="product-studio-title">
          <ButtonLink href={`/admin/modules/products/${product.id}`} size="sm" variant="ghost">
            <ArrowLeft size={16} />
            Product
          </ButtonLink>
          <div>
            <p className="catalog-kicker">Bundle builder</p>
            <h1>{product.name}</h1>
            <p>Compose the products and quantities included in this sellable bundle.</p>
          </div>
          <div className="product-studio-badges">
            <span className={statusClass(product.status)}>{product.status.toLowerCase()}</span>
            <span className="catalog-pill">{enumLabel(product.type)}</span>
            <span className="catalog-pill">{product.bundleComponents.length} items</span>
          </div>
        </div>
        <div className="product-studio-actions">
          <ButtonLink href={`/admin/modules/products/${product.id}`} size="sm" variant="secondary">
            Product details
          </ButtonLink>
        </div>
      </header>

      {savedMessage ? <div className="success-message">{savedMessage}</div> : null}
      {errorMessage ? <div className="error">{decodeURIComponent(errorMessage)}</div> : null}

      <main className="bundle-builder-grid">
        <section className="studio-workbench">
          <div className="studio-section-head">
            <div>
              <p className="catalog-rail-label">Contents</p>
              <h2>Included products</h2>
            </div>
            <Boxes size={20} />
          </div>

          <div className="studio-bundle-list">
            {product.bundleComponents.map((component) => (
              <article className="studio-bundle-row" key={component.id}>
                <span>
                  <strong>{component.componentProduct.name}</strong>
                  <small>{component.componentProduct.sku || component.notes || "No SKU or notes"}</small>
                </span>
                <span>
                  <small>Variant</small>
                  <strong>{component.componentVariant?.name || "Default"}</strong>
                </span>
                <span>
                  <small>Qty</small>
                  <strong>{component.quantity}</strong>
                </span>
                <span>
                  <small>Optional</small>
                  <strong>{component.isOptional ? "yes" : "no"}</strong>
                </span>
                <form action={removeBundleComponentAction}>
                  <input type="hidden" name="id" value={component.id} />
                  <input type="hidden" name="productId" value={product.id} />
                  <Button size="sm" type="submit" variant="danger">
                    <Trash2 size={15} />
                    Remove
                  </Button>
                </form>
              </article>
            ))}
            {!product.bundleComponents.length ? (
              <div className="catalog-empty-state">
                <Boxes size={30} />
                <h3>No bundle items</h3>
                <p>Add products and quantities to turn this item into a bundle.</p>
              </div>
            ) : null}
          </div>
        </section>

        <form action={createBundleComponentAction} className="studio-action-form bundle-builder-add">
          <input type="hidden" name="productId" value={product.id} />
          <div className="studio-section-head">
            <div>
              <p className="catalog-rail-label">Add item</p>
              <h2>Bundle component</h2>
            </div>
            <PackagePlus size={20} />
          </div>
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
            <select id="componentVariantId" name="componentVariantId" defaultValue="">
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
          <div className="catalog-form-grid is-two">
            <div className="ui-field">
              <label htmlFor="bundleQuantity">Quantity</label>
              <input id="bundleQuantity" name="quantity" min="1" max="999" type="number" defaultValue="1" />
            </div>
            <div className="ui-field">
              <label htmlFor="bundleSort">Sort</label>
              <input id="bundleSort" name="sortOrder" type="number" defaultValue={product.bundleComponents.length} />
            </div>
          </div>
          <div className="ui-field">
            <label htmlFor="bundleNotes">Notes</label>
            <input id="bundleNotes" name="notes" />
          </div>
          <label className="ui-check-row">
            <input name="isOptional" type="checkbox" />
            Optional bundle component
          </label>
          <Button type="submit" variant="secondary" disabled={!bundleProducts.length}>
            <Plus size={16} />
            Add bundle item
          </Button>
        </form>
      </main>
    </div>
  );
}
