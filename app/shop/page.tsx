import type { Metadata } from "next";
import Link from "next/link";
import NextImage from "next/image";
import { notFound } from "next/navigation";
import { ProductStatus, ProductType } from "@prisma/client";
import { TrackedAnalyticsForm } from "@/components/analytics/tracker";
import { JsonLd } from "@/components/structured-data";
import { ShoppingCart } from "lucide-react";
import { addToCartAction } from "@/app/cart/actions";
import { formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { buildBreadcrumbJsonLd, buildPageMetadata, getCanonicalBaseUrl } from "@/lib/seo";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return buildPageMetadata(settings, {
    canonicalPath: "/shop",
    description: "Browse active products, packages, and collections.",
    title: "Shop"
  });
}

export default async function ShopPage() {
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("products")) notFound();
  const baseUrl = await getCanonicalBaseUrl(settings.siteId);

  const [products, collections] = await Promise.all([
    prisma.product.findMany({
      where: { siteId: settings.siteId, status: ProductStatus.ACTIVE },
      include: {
        variants: {
          where: { isActive: true },
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.collection.findMany({
      where: { siteId: settings.siteId, status: ProductStatus.ACTIVE, isFeatured: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 6
    })
  ]);

  return (
    <main className="site-shell" style={themeToCssVars(settings)}>
      <JsonLd
        data={buildBreadcrumbJsonLd(
          [
            { name: "Home", path: "/" },
            { name: "Shop", path: "/shop" }
          ],
          baseUrl
        )}
      />
      <nav className="site-nav">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{settings.businessName}</span>
        </Link>
        <div className="site-nav-links">
          <Link href="/cart" className="button">
            <ShoppingCart size={18} />
            Cart
          </Link>
        </div>
      </nav>

      <section className="section" style={{ paddingTop: 22 }}>
        <div className="page-header">
          <div>
            <p className="eyebrow">Shop</p>
            <h1>Products and packages</h1>
            <p>Browse available products and packages, apply coupons, and check out securely.</p>
          </div>
        </div>

        {collections.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {collections.map((collection) => (
              <span className="pill" key={collection.id}>
                {collection.name}
              </span>
            ))}
          </div>
        ) : null}

        <div className="feature-grid">
          {products.map((product) => {
            const variant = product.variants[0] || null;
            const priceCents = variant?.priceCents ?? product.basePriceCents;

            return (
              <article className="card stack" key={product.id}>
                {product.imageUrl ? (
                  <NextImage
                    alt={product.name}
                    src={product.imageUrl}
                    width={720}
                    height={450}
                    unoptimized
                    style={{ aspectRatio: "16 / 10", borderRadius: 6, objectFit: "cover", width: "100%" }}
                  />
                ) : null}
                <div>
                  <h2 style={{ fontSize: "1.25rem" }}>{product.name}</h2>
                  <p>{product.summary || product.description || "Catalog item"}</p>
                </div>
                <strong>{formatMoney(priceCents, product.currency)}</strong>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: "auto" }}>
                  <Link className="button secondary" href={`/shop/${product.slug}`}>
                    Details
                  </Link>
                  {variant && product.type !== ProductType.GIFT_CARD ? (
                    <TrackedAnalyticsForm
                      action={addToCartAction}
                      analyticsData={JSON.stringify({
                        currency: product.currency,
                        productId: product.id,
                        productName: product.name,
                        variants: [
                          {
                            id: variant.id,
                            name: variant.name,
                            priceCents: variant.priceCents ?? product.basePriceCents
                          }
                        ]
                      })}
                      mode="add_to_cart"
                    >
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="variantId" value={variant.id} />
                      <input type="hidden" name="quantity" value="1" />
                      <button className="button" type="submit" aria-label={`Add ${product.name} to cart`}>
                        <ShoppingCart size={18} />
                        Add
                      </button>
                    </TrackedAnalyticsForm>
                  ) : product.type === ProductType.GIFT_CARD ? (
                    <Link className="button" href={`/shop/${product.slug}`}>
                      Gift
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
          {!products.length ? <p className="empty-state">No active products yet.</p> : null}
        </div>
      </section>
    </main>
  );
}
