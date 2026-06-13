import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CreditCard, FileText, ShoppingBag, Trash2 } from "lucide-react";
import { FormAttachmentTargetType } from "@prisma/client";
import { TrackAnalyticsEvent, TrackedAnalyticsForm } from "@/components/analytics/tracker";
import { buildPurchaseEvent } from "@/lib/analytics/ecommerce";
import {
  applyPublicCartCouponAction,
  applyPublicGiftCardAction,
  preparePublicCheckoutAction,
  removePublicGiftCardAction,
  removePublicCartCouponAction,
  saveCartForRecoveryAction,
  updatePublicCartItemAction
} from "./actions";
import { getOpenCart } from "@/lib/commerce/cart";
import { formatMoney } from "@/lib/format";
import { getPublicFormAttachments, publicFormAttachmentHref } from "@/lib/forms/attachments";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";

export const dynamic = "force-dynamic";

type CartPageProps = {
  searchParams: Promise<{ added?: string; checkout?: string; recovered?: string; saved?: string; error?: string; order?: string }>;
};

const cartCookieName = "commerce_cart_id";

function itemName(item: {
  product: { name: string };
  variant: { name: string; isDefault: boolean; optionName: string; optionValue: string } | null;
}) {
  if (!item.variant || item.variant.isDefault) return item.product.name;
  if (item.variant.optionName || item.variant.optionValue) {
    return `${item.product.name} - ${item.variant.optionName || "Option"}: ${item.variant.optionValue || item.variant.name}`;
  }
  return `${item.product.name} - ${item.variant.name}`;
}

export default async function CartPage({ searchParams }: CartPageProps) {
  const [query, settings, cookieStore] = await Promise.all([searchParams, getSiteSettings(), cookies()]);
  if (!settings.enabledModuleIds.includes("products")) notFound();

  const cartId = cookieStore.get(cartCookieName)?.value;
  const cartResult = await getOpenCart(cartId);
  const preparedOrder = query.order
    ? await prisma.order.findUnique({
        where: { siteId_orderNumber: { siteId: settings.siteId, orderNumber: query.order } },
        include: {
          coupon: true,
          items: { orderBy: { createdAt: "asc" } },
          payments: { orderBy: { createdAt: "desc" }, take: 1 }
        }
      })
    : null;
  const purchaseEvent =
    query.checkout === "success" && preparedOrder
      ? buildPurchaseEvent({
          coupon: preparedOrder.coupon?.code || undefined,
          currency: preparedOrder.currency,
          items: preparedOrder.items.map((item) => ({
            item_id: item.productId,
            item_name: item.name,
            price: Number((item.unitPriceCents / 100).toFixed(2)),
            quantity: item.quantity
          })),
          totalCents: preparedOrder.totalCents,
          transactionId: preparedOrder.orderNumber
        })
      : null;
  const orderFormAttachments = preparedOrder
    ? await getPublicFormAttachments({
        siteId: settings.siteId,
        targetId: preparedOrder.id,
        targetType: FormAttachmentTargetType.ORDER
      })
    : [];

  return (
    <main className="site-shell" style={themeToCssVars(settings)}>
      {purchaseEvent ? <TrackAnalyticsEvent event={purchaseEvent} onceKey={`purchase:${preparedOrder?.orderNumber}`} /> : null}
      <nav className="site-nav">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{settings.businessName}</span>
        </Link>
        <div className="site-nav-links">
          <Link href="/shop" className="button secondary">
            <ShoppingBag size={18} />
            Shop
          </Link>
        </div>
      </nav>

      <section className="section" style={{ paddingTop: 22 }}>
        <div className="stack">
          <div className="page-header">
            <div>
              <p className="eyebrow">Cart</p>
              <h1 style={{ fontSize: "2.4rem" }}>Review order details</h1>
              <p>Cart totals are repriced from the current catalog before checkout handoff records are created.</p>
            </div>
          </div>

          {query.added ? (
            <div className="success-message" role="status" aria-live="polite">
              Item added to cart.
            </div>
          ) : null}
          {query.saved ? (
            <div className="success-message" role="status" aria-live="polite">
              {query.saved === "recovery" ? "Your cart reminder is set." : "Cart updated."}
            </div>
          ) : null}
          {query.recovered ? (
            <div className="success-message" role="status" aria-live="polite">
              Your saved cart is ready.
            </div>
          ) : null}
          {query.error ? (
            <div className="error" role="alert">
              {query.error}
            </div>
          ) : null}
          {preparedOrder ? (
            <div className="success-message" role="status" aria-live="polite">
              Order {preparedOrder.orderNumber} is {preparedOrder.status.toLowerCase()} for{" "}
              {formatMoney(preparedOrder.totalCents, preparedOrder.currency)}.
            </div>
          ) : null}
          {orderFormAttachments.length ? (
            <div className="card stack">
              <h2 style={{ fontSize: "1.35rem" }}>Order forms</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {orderFormAttachments.map((attachment) => (
                  <Link
                    className={attachment.isRequired ? "button" : "button secondary"}
                    href={publicFormAttachmentHref({
                      formSlug: attachment.form.slug,
                      targetId: attachment.targetId,
                      targetType: attachment.targetType
                    })}
                    key={attachment.id}
                  >
                    <FileText size={18} />
                    {attachment.isRequired ? "Required: " : ""}
                    {attachment.form.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {!cartResult || !cartResult.cart.items.length ? (
            <div className="card stack">
              <h2>Your cart is empty</h2>
              <p className="lead">Browse the storefront to add an active product or package.</p>
              <Link className="button" href="/shop">
                <ShoppingBag size={18} />
                Browse products
              </Link>
            </div>
          ) : (
            <section className="grid-2">
              <div className="card stack">
                <h2 style={{ fontSize: "1.35rem" }}>Items</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Total</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cartResult.cart.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{itemName(item)}</strong>
                          <br />
                          <span style={{ color: "var(--muted)" }}>{formatMoney(item.unitPriceCents, cartResult.cart.currency)} each</span>
                        </td>
                        <td>
                          <form action={updatePublicCartItemAction} style={{ display: "flex", gap: 8 }}>
                            <input type="hidden" name="itemId" value={item.id} />
                            <input
                              aria-label={`Quantity for ${item.product.name}`}
                              name="quantity"
                              min="0"
                              max="999"
                              style={{ maxWidth: 84 }}
                              type="number"
                              defaultValue={item.quantity}
                            />
                            <button className="button secondary" style={{ minWidth: 76 }} type="submit">
                              Save
                            </button>
                          </form>
                        </td>
                        <td>{formatMoney(item.lineTotalCents, cartResult.cart.currency)}</td>
                        <td>
                          <form action={updatePublicCartItemAction}>
                            <input type="hidden" name="itemId" value={item.id} />
                            <input type="hidden" name="quantity" value="0" />
                            <button className="button secondary" style={{ minWidth: 44 }} type="submit" aria-label={`Remove ${item.product.name}`}>
                              <Trash2 size={16} />
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card stack">
                <h2 style={{ fontSize: "1.35rem" }}>Totals</h2>
                <table className="table" style={{ minWidth: 0 }}>
                  <tbody>
                    <tr>
                      <td>Subtotal</td>
                      <td>{formatMoney(cartResult.cart.subtotalCents, cartResult.cart.currency)}</td>
                    </tr>
                    <tr>
                      <td>Discount</td>
                      <td>{formatMoney(cartResult.cart.discountCents, cartResult.cart.currency)}</td>
                    </tr>
                    <tr>
                      <td>{settings.commerceShippingLabel}</td>
                      <td>{formatMoney(cartResult.cart.shippingCents, cartResult.cart.currency)}</td>
                    </tr>
                    <tr>
                      <td>{settings.commerceTaxLabel}</td>
                      <td>{formatMoney(cartResult.cart.taxCents, cartResult.cart.currency)}</td>
                    </tr>
                    <tr>
                      <td>Gift card</td>
                      <td>-{formatMoney(cartResult.cart.giftCardCreditCents, cartResult.cart.currency)}</td>
                    </tr>
                    <tr>
                      <td>Total</td>
                      <td>
                        <strong>{formatMoney(cartResult.cart.totalCents, cartResult.cart.currency)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div className="subpanel form-grid">
                  <h3>Coupon</h3>
                  {cartResult.cart.coupon ? (
                    <form action={removePublicCartCouponAction} className="form-grid">
                      <p>Applied: {cartResult.cart.coupon.code}</p>
                      <button className="button secondary" type="submit">
                        Remove coupon
                      </button>
                    </form>
                  ) : (
                    <form action={applyPublicCartCouponAction} className="form-grid">
                      <div className="field">
                        <label htmlFor="coupon-code">Coupon code</label>
                        <input id="coupon-code" name="code" />
                      </div>
                      <button className="button secondary" type="submit">
                        Apply coupon
                      </button>
                    </form>
                  )}
                </div>

                <div className="subpanel form-grid">
                  <h3>Gift card</h3>
                  {cartResult.cart.giftCard ? (
                    <form action={removePublicGiftCardAction} className="form-grid">
                      <p>
                        Applied: {cartResult.cart.giftCard.code} ({formatMoney(cartResult.cart.giftCardCreditCents, cartResult.cart.currency)})
                      </p>
                      <button className="button secondary" type="submit">
                        Remove gift card
                      </button>
                    </form>
                  ) : (
                    <form action={applyPublicGiftCardAction} className="form-grid">
                      <div className="field">
                        <label htmlFor="gift-card-code">Gift card code</label>
                        <input id="gift-card-code" name="code" />
                      </div>
                      <button className="button secondary" type="submit">
                        Apply gift card
                      </button>
                    </form>
                  )}
                </div>

                <form action={saveCartForRecoveryAction} className="subpanel form-grid">
                  <h3>Save this cart</h3>
                  <div className="field">
                    <label htmlFor="recovery-name">Name</label>
                    <input id="recovery-name" name="customerName" />
                  </div>
                  <div className="field">
                    <label htmlFor="recovery-email">Email</label>
                    <input id="recovery-email" name="customerEmail" type="email" required />
                  </div>
                  <label className="checkbox-row">
                    <input name="marketingConsent" type="checkbox" required />
                    <span>Email me only about this saved cart if I do not finish checkout.</span>
                  </label>
                  <button className="button secondary" type="submit">
                    Save cart
                  </button>
                </form>

                <TrackedAnalyticsForm
                  action={preparePublicCheckoutAction}
                  analyticsData={JSON.stringify({
                    coupon: cartResult.cart.coupon?.code || undefined,
                    currency: cartResult.cart.currency,
                    items: cartResult.cart.items.map((item) => ({
                      item_id: item.productId,
                      item_name: itemName(item),
                      item_variant: item.variant && !item.variant.isDefault ? item.variant.name : undefined,
                      price: Number((item.unitPriceCents / 100).toFixed(2)),
                      quantity: item.quantity
                    })),
                    totalCents: cartResult.cart.totalCents
                  })}
                  className="subpanel form-grid"
                  mode="begin_checkout"
                >
                  <h3>Checkout</h3>
                  <div className="field">
                    <label htmlFor="checkout-name">Name</label>
                    <input id="checkout-name" name="customerName" required />
                  </div>
                  <div className="field">
                    <label htmlFor="checkout-email">Email</label>
                    <input id="checkout-email" name="customerEmail" type="email" required />
                  </div>
                  <button className="button" type="submit">
                    <CreditCard size={18} />
                    Continue to checkout
                  </button>
                </TrackedAnalyticsForm>
              </div>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
