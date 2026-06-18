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
import { Button, ButtonLink, Card, EqualGrid } from "@/components/ui";

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
  })]
  );

  return (
    <main className="site-shell" style={themeToCssVars(settings)}>
      <JsonLd
        data={buildBreadcrumbJsonLd(
          [
          { name: "Home", path: "/" },
          { name: "Shop", path: "/shop" }],

          baseUrl
        )} />
      
      <nav className="site-nav">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{settings.businessName}</span>
        </Link>
        <div className="site-nav-links">
          <ButtonLink href="/cart">
            <ShoppingCart size={18} />
            Cart
          </ButtonLink>
        </div>
      </nav>

      <section className="section ui-zero">
        <div className="page-header">
          <div>
            <p className="eyebrow">Shop</p>
            <h1>Products and packages</h1>
            <p>Browse available products and packages, apply coupons, and check out securely.</p>
          </div>
        </div>

        {collections.length ?
        <div className="ui-zero">
            {collections.map((collection) =>
          <span className="ui-badge" key={collection.id}>
                {collection.name}
              </span>
          )}
          </div> :
        null}

        <EqualGrid>
          {products.map((product) => {
            const variant = product.variants[0] || null;
            const priceCents = variant?.priceCents ?? product.basePriceCents;

            return (
              <Card key={product.id} as="article" bodyClassName="ui-stack">
                {product.imageUrl ?
                <NextImage className="ui-zero"
                alt={product.name}
                src={product.imageUrl}
                width={720}
                height={450}
                unoptimized /> :


                null}
                <div>
                  <h2 className="ui-zero">{product.name}</h2>
                  <p>{product.summary || product.description || "Catalog item"}</p>
                </div>
                <strong>{formatMoney(priceCents, product.currency)}</strong>
                <div className="ui-zero">
                  <ButtonLink href={`/shop/${product.slug}`} variant="secondary">
                    Details
                  </ButtonLink>
                  {variant && product.type !== ProductType.GIFT_CARD ?
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
                      }]

                    })}
                    mode="add_to_cart">
                    
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="variantId" value={variant.id} />
                      <input type="hidden" name="quantity" value="1" />
                      <Button type="submit" aria-label={`Add ${product.name} to cart`}>
                        <ShoppingCart size={18} />
                        Add
                      </Button>
                    </TrackedAnalyticsForm> :
                  product.type === ProductType.GIFT_CARD ?
                  <ButtonLink href={`/shop/${product.slug}`}>
                      Gift
                    </ButtonLink> :
                  null}
                </div>
              </Card>);

          })}
          {!products.length ? <p className="empty-state">No active products yet.</p> : null}
        </EqualGrid>
      </section>
    </main>);

}
