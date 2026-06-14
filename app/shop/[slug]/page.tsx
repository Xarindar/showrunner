import type { Metadata } from "next";
import Link from "next/link";
import NextImage from "next/image";
import { notFound } from "next/navigation";
import { AnalyticsEventType, ProductStatus, ProductType } from "@prisma/client";
import { TrackAnalyticsEvent, TrackedAnalyticsForm } from "@/components/analytics/tracker";
import { JsonLd } from "@/components/structured-data";
import { ShoppingCart } from "lucide-react";
import { addToCartAction } from "@/app/cart/actions";
import { buildViewItemEvent } from "@/lib/analytics/ecommerce";
import { emitAnalyticsEvent, requestAttribution } from "@/lib/events/emit";
import { formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { buildBreadcrumbJsonLd, buildImageObjectJsonLd, buildPageMetadata, buildProductJsonLd, getCanonicalBaseUrl } from "@/lib/seo";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";

export const dynamic = "force-dynamic";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const [{ slug }, settings] = await Promise.all([params, getSiteSettings()]);
  if (!settings.enabledModuleIds.includes("products")) return {};

  const product = await prisma.product.findUnique({
    where: { siteId_slug: { siteId: settings.siteId, slug } },
    select: { description: true, imageUrl: true, name: true, status: true, summary: true }
  });

  if (!product || product.status !== ProductStatus.ACTIVE) return {};

  return buildPageMetadata(settings, {
    canonicalPath: `/shop/${slug}`,
    description: product.summary || product.description,
    image: product.imageUrl,
    title: product.name
  });
}

function variantLabel(variant: { name: string; optionName: string; optionValue: string; isDefault: boolean }) {
  if (variant.isDefault) return variant.name;
  if (variant.optionName || variant.optionValue) return `${variant.optionName || "Option"}: ${variant.optionValue || variant.name}`;
  return variant.name;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const [{ slug }, settings] = await Promise.all([params, getSiteSettings()]);
  if (!settings.enabledModuleIds.includes("products")) notFound();
  const baseUrl = await getCanonicalBaseUrl(settings.siteId);

  const product = await prisma.product.findUnique({
    where: { siteId_slug: { siteId: settings.siteId, slug } },
    include: {
      variants: {
        where: { isActive: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
      },
      collectionProducts: {
        include: { collection: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!product || product.status !== ProductStatus.ACTIVE) notFound();

  const defaultVariant = product.variants[0] || null;
  const defaultPriceCents = defaultVariant?.priceCents ?? product.basePriceCents;
  const isGiftCard = product.type === ProductType.GIFT_CARD;
  const categories = product.collectionProducts.map(({ collection }) => collection.name);
  const viewItemEvent = buildViewItemEvent({
    categories,
    currency: product.currency,
    productId: product.id,
    productName: product.name,
    unitPriceCents: defaultPriceCents,
    variantName: defaultVariant && !defaultVariant.isDefault ? defaultVariant.name : undefined
  });

  await emitAnalyticsEvent({
    ...(await requestAttribution(undefined, `/shop/${product.slug}`)),
    currency: product.currency,
    dedupeWindowMinutes: 60,
    eventName: "view_item",
    eventType: AnalyticsEventType.VIEW_ITEM,
    metadata: viewItemEvent,
    relatedId: product.id,
    relatedType: "product",
    valueCents: defaultPriceCents
  });

  return (
    <main className="site-shell" style={themeToCssVars(settings)}>
      <JsonLd
        data={[
          buildProductJsonLd({
            baseUrl,
            categories,
            currency: product.currency,
            description: product.summary || product.description,
            imageUrl: product.imageUrl,
            name: product.name,
            path: `/shop/${product.slug}`,
            priceCents: defaultPriceCents,
            sku: defaultVariant?.sku || product.sku
          }),
          product.imageUrl
            ? buildImageObjectJsonLd({
                baseUrl,
                description: product.summary || product.description,
                name: product.name,
                url: product.imageUrl
              })
            : {},
          buildBreadcrumbJsonLd(
            [
              { name: "Home", path: "/" },
              { name: "Shop", path: "/shop" },
              { name: product.name, path: `/shop/${product.slug}` }
            ],
            baseUrl
          )
        ].filter((item) => Object.keys(item).length)}
      />
      <TrackAnalyticsEvent event={viewItemEvent} onceKey={`view-item:${product.id}:${defaultVariant?.id || "default"}`} />
      <nav className="site-nav">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{settings.businessName}</span>
        </Link>
        <div className="site-nav-links">
          <Link href="/shop" className="button secondary">
            Shop
          </Link>
          <Link href="/cart" className="button">
            <ShoppingCart size={18} />
            Cart
          </Link>
        </div>
      </nav>

      <section className="section" style={{ paddingTop: 22 }}>
        <div className="grid-2" style={{ alignItems: "start" }}>
          <div className="card">
            {product.imageUrl ? (
              <NextImage
                alt={product.name}
                src={product.imageUrl}
                width={1000}
                height={720}
                priority
                unoptimized
                style={{ aspectRatio: "4 / 3", borderRadius: 6, objectFit: "cover", width: "100%" }}
              />
            ) : (
              <div className="empty-state">No product image</div>
            )}
          </div>

          <div className="card stack">
            <div>
              <p className="eyebrow">Product</p>
              <h1 style={{ fontSize: "2.4rem" }}>{product.name}</h1>
              <p className="lead">{product.summary || product.description}</p>
            </div>

            <strong style={{ fontSize: "1.5rem" }}>{formatMoney(defaultPriceCents, product.currency)}</strong>

            {product.collectionProducts.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {product.collectionProducts.map(({ collection }) => (
                  <span className="pill" key={collection.id}>
                    {collection.name}
                  </span>
                ))}
              </div>
            ) : null}

            {defaultVariant ? (
              <TrackedAnalyticsForm
                action={addToCartAction}
                analyticsData={JSON.stringify({
                  categories,
                  currency: product.currency,
                  productId: product.id,
                  productName: product.name,
                  variants: product.variants.map((variant) => ({
                    id: variant.id,
                    name: variantLabel(variant),
                    priceCents: variant.priceCents ?? product.basePriceCents
                  }))
                })}
                className="form-grid"
                mode="add_to_cart"
              >
                <input type="hidden" name="productId" value={product.id} />
                <div className="grid-2">
                  <div className="field">
                    <label htmlFor="variantId">Option</label>
                    <select id="variantId" name="variantId" defaultValue={defaultVariant.id}>
                      {product.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variantLabel(variant)} - {formatMoney(variant.priceCents ?? product.basePriceCents, product.currency)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isGiftCard ? (
                    <input type="hidden" name="quantity" value="1" />
                  ) : (
                    <div className="field">
                      <label htmlFor="quantity">Quantity</label>
                      <input id="quantity" name="quantity" type="number" min="1" max="999" defaultValue="1" required />
                    </div>
                  )}
                </div>
                {isGiftCard ? (
                  <div className="subpanel form-grid">
                    <h2 style={{ fontSize: "1.05rem" }}>Gift recipient</h2>
                    <div className="grid-2">
                      <div className="field">
                        <label htmlFor="giftCardRecipientName">Recipient name</label>
                        <input id="giftCardRecipientName" name="giftCardRecipientName" />
                      </div>
                      <div className="field">
                        <label htmlFor="giftCardRecipientEmail">Recipient email</label>
                        <input id="giftCardRecipientEmail" name="giftCardRecipientEmail" type="email" required />
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor="giftCardMessage">Message</label>
                      <textarea id="giftCardMessage" name="giftCardMessage" />
                    </div>
                  </div>
                ) : null}
                <button className="button" type="submit" aria-label={`Add ${product.name} to cart`}>
                  <ShoppingCart size={18} />
                  Add to cart
                </button>
              </TrackedAnalyticsForm>
            ) : (
              <span className="pill">No active variants</span>
            )}

            {product.description && product.description !== product.summary ? (
              <div className="subpanel">
                <h2 style={{ fontSize: "1.2rem" }}>Details</h2>
                <p>{product.description}</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
