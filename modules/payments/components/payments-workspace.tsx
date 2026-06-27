"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, Lock, ReceiptText, Settings2, TicketPlus } from "lucide-react";
import { Button, Modal, Table } from "@/components/ui";
import { MethodMark, ProviderMark } from "./brand-marks";
import { buildConnectWizards, ConnectWizard, type WebhookUrls } from "./connect-wizard";
import {
  CheckoutModal,
  CheckoutTotalsModal,
  CouponModal,
  ManageProviderModal,
  MethodsModal,
  type CheckoutTotalsSettings,
  type MethodOption
} from "./manage-modals";

type ProviderKey = "STRIPE" | "SQUARE" | "PAYPAL";
type CouponValueType = "PERCENT" | "FIXED";

export type ProviderCard = {
  provider: ProviderKey;
  name: string;
  recommended?: boolean;
  connected: boolean;
  needsAttention: boolean;
  headline: string;
  manageDetail: string;
};

export type ActiveCoupon = {
  amountCents: number | null;
  code: string;
  createdAt: string;
  endsAt: string | null;
  id: string;
  maxRedemptions: number | null;
  percentOff: number | null;
  redemptionCount: number;
  startsAt: string | null;
  type: CouponValueType;
};

export type PaymentsWorkspaceProps = {
  providers: ProviderCard[];
  methods: { connected: boolean; enabledKeys: string[]; options: MethodOption[]; applePayStatus?: string };
  checkout: {
    active?: string;
    anyConnected: boolean;
    disconnected: boolean;
    providers: { value: string; label: string; connected: boolean }[];
  };
  checkoutTotals: CheckoutTotalsSettings;
  coupons: ActiveCoupon[];
  featuredConnected: boolean;
  webhooks: WebhookUrls;
};

type ActiveModal =
  | { kind: "connect"; provider: ProviderKey }
  | { kind: "manage"; provider: ProviderKey }
  | { kind: "methods" }
  | { kind: "checkout" }
  | { kind: "checkoutTotals" }
  | { kind: "coupon" }
  | null;

function couponValueLabel(coupon: ActiveCoupon) {
  if (coupon.type === "PERCENT") return `${coupon.percentOff || 0}% off`;
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format((coupon.amountCents || 0) / 100);
}

function couponLimitLabel(coupon: ActiveCoupon) {
  if (coupon.maxRedemptions === null) return "No limit";
  return `${coupon.redemptionCount} / ${coupon.maxRedemptions}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

function couponAvailabilityLabel(coupon: ActiveCoupon) {
  if (coupon.startsAt && coupon.endsAt) return `${dateLabel(coupon.startsAt)} to ${dateLabel(coupon.endsAt)}`;
  if (coupon.startsAt) return `Starts ${dateLabel(coupon.startsAt)}`;
  if (coupon.endsAt) return `Ends ${dateLabel(coupon.endsAt)}`;
  return "Always available";
}

function moneyLabel(cents?: number | null) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format((cents || 0) / 100);
}

function percentLabel(basisPoints?: number | null) {
  return `${((basisPoints || 0) / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

export function PaymentsWorkspace({
  checkout,
  checkoutTotals,
  coupons,
  featuredConnected,
  methods,
  providers,
  webhooks
}: PaymentsWorkspaceProps) {
  const [active, setActive] = useState<ActiveModal>(null);
  const close = () => setActive(null);

  const wizards = useMemo(() => buildConnectWizards(webhooks), [webhooks]);
  const connectedCount = providers.filter((provider) => provider.connected).length;

  const enabledMethodLabels = methods.options
    .filter((option) => methods.enabledKeys.includes(option.key))
    .map((option) => option.label);

  // Guided "set up" progress: connect an account → turn on ways to pay → pick the checkout account.
  const steps = [
    connectedCount > 0,
    methods.connected && methods.enabledKeys.length > 0,
    Boolean(checkout.active) && !checkout.disconnected
  ];
  const done = steps.filter(Boolean).length;

  const manageProvider = active?.kind === "manage" ? providers.find((p) => p.provider === active.provider) : undefined;
  const connectConfig = active?.kind === "connect" ? wizards[active.provider] : undefined;
  const simpleModalOpen = active !== null && active.kind !== "connect";

  const modalTitle =
    active?.kind === "connect"
      ? `Connect ${wizards[active.provider].name}`
      : active?.kind === "manage"
        ? `Manage ${manageProvider?.name ?? "provider"}`
        : active?.kind === "methods"
          ? "Ways customers pay"
          : active?.kind === "checkout"
            ? "Checkout account"
            : active?.kind === "checkoutTotals"
              ? "Checkout totals"
              : active?.kind === "coupon"
                ? "Add coupon"
                : "";

  const taxSummary = checkoutTotals.taxEnabled
    ? `${checkoutTotals.taxLabel} · ${percentLabel(checkoutTotals.taxRateBps)}`
    : "Tax off";
  const shippingSummary = checkoutTotals.shippingEnabled
    ? `${checkoutTotals.shippingLabel} · ${moneyLabel(checkoutTotals.shippingFlatCents)}`
    : "Shipping off";

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Payments</p>
          <h1>Get paid</h1>
          <p>
            Connect your own payment accounts and choose how customers pay. You paste credentials from each provider once;
            we verify them live, store them encrypted, and charge directly on your own account.
          </p>
        </div>
        <div className="payments-page-actions">
          <Button onClick={() => setActive({ kind: "coupon" })} type="button">
            <TicketPlus size={16} />
            Add coupon
          </Button>
          <span className={done === steps.length ? "guided-progress guided-progress-done" : "guided-progress"}>
            {done} of {steps.length} set up
          </span>
        </div>
      </header>

      <section aria-labelledby="active-coupons-title" className="ui-data-table-shell payments-coupons-table">
        <div className="ui-data-table-header">
          <div className="ui-data-table-titlebar">
            <div>
              <h2 className="section-title" id="active-coupons-title">
                Active coupons
              </h2>
              <p className="ui-zero">{coupons.length} available at checkout</p>
            </div>
          </div>
        </div>
        <Table className="ui-data-table-scroll" tableClassName="ui-data-table payments-coupons-index-table">
          <colgroup>
            <col className="payments-coupons-col-code" />
            <col className="payments-coupons-col-value" />
            <col className="payments-coupons-col-redemptions" />
            <col className="payments-coupons-col-availability" />
            <col className="payments-coupons-col-created" />
          </colgroup>
          <thead>
            <tr>
              <th>Code</th>
              <th>Value</th>
              <th>Redemptions</th>
              <th>Availability</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((coupon) => (
              <tr key={coupon.id}>
                <td>
                  <div className="ui-object-cell">
                    <span aria-hidden="true" className="ui-object-thumb ui-object-thumb-empty payments-coupon-thumb">
                      <TicketPlus size={16} />
                    </span>
                    <span className="ui-object-copy">
                      <strong className="ui-truncate" title={coupon.code}>{coupon.code}</strong>
                      <span className="ui-object-meta">{coupon.type === "PERCENT" ? "Percent" : "Fixed"}</span>
                    </span>
                  </div>
                </td>
                <td>{couponValueLabel(coupon)}</td>
                <td>{couponLimitLabel(coupon)}</td>
                <td>
                  <span className="ui-truncate" title={couponAvailabilityLabel(coupon)}>
                    {couponAvailabilityLabel(coupon)}
                  </span>
                </td>
                <td>{dateLabel(coupon.createdAt)}</td>
              </tr>
            ))}
            {!coupons.length ? (
              <tr>
                <td className="ui-data-table-empty" colSpan={5}>
                  No active coupons yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </section>

      {/* Cash App Pay + Affirm gating callout ------------------------------ */}
      <section className={featuredConnected ? "subpanel pay-feature pay-feature-on" : "subpanel pay-feature"}>
        <div className="pay-feature-main">
          <span className="pay-feature-icon">{featuredConnected ? <CheckCircle2 size={20} /> : <Lock size={20} />}</span>
          <div>
            <strong>Cash App Pay &amp; Affirm</strong>
            <p className="ui-zero">
              {featuredConnected
                ? "Included with Stripe. Switch them on under “Ways customers pay.”"
                : "These ride along with Stripe. Connect Stripe first, then you can switch them on — there’s no separate Cash App or Affirm account to create."}
            </p>
            <div className="pay-chips">
              <span className={featuredConnected ? "pay-chip pay-chip-on" : "pay-chip pay-chip-locked"}>
                {featuredConnected ? <MethodMark methodKey="CASH_APP_PAY" size={14} /> : <Lock size={12} />} Cash App Pay
              </span>
              <span className={featuredConnected ? "pay-chip pay-chip-on" : "pay-chip pay-chip-locked"}>
                {featuredConnected ? <MethodMark methodKey="AFFIRM" size={14} /> : <Lock size={12} />} Affirm
              </span>
            </div>
          </div>
        </div>
        {featuredConnected ? (
          <Button onClick={() => setActive({ kind: "methods" })} type="button" variant="secondary">
            Manage ways to pay
          </Button>
        ) : (
          <Button onClick={() => setActive({ kind: "connect", provider: "STRIPE" })} type="button">
            Set up Stripe first
          </Button>
        )}
      </section>

      {/* Payment providers ------------------------------------------------- */}
      <section className="subpanel form-grid pay-provider-panel">
        <div className="module-toggle-main">
          <span>
            <strong>Payment Providers</strong>
          </span>
          <small>Pick a provider to set up — the whole tile is the button. You can connect more than one and choose which runs checkout below.</small>
        </div>
        <div className="pay-provider-row">
          {providers.map((provider) => (
            <button
              className={[
                "pay-provider-tile",
                provider.connected ? "is-connected" : "",
                provider.connected && provider.needsAttention ? "needs-attention" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              key={provider.provider}
              onClick={() =>
                setActive(
                  provider.connected
                    ? { kind: "manage", provider: provider.provider }
                    : { kind: "connect", provider: provider.provider }
                )
              }
              type="button">
              {provider.recommended ? <span className="pay-provider-rec">Recommended</span> : null}
              <span className="pay-provider-logo">
                <ProviderMark provider={provider.provider} size={38} />
              </span>
              <span className="pay-provider-name">{provider.name}</span>
              <span className="pay-provider-status">
                {provider.connected ? (
                  provider.needsAttention ? (
                    <>
                      <AlertTriangle size={13} /> Needs attention
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={13} /> Connected · Manage
                    </>
                  )
                ) : (
                  "Click to set up"
                )}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Ways to pay ------------------------------------------------------- */}
      <section className="subpanel form-grid">
        <div className="module-toggle-main">
          <span>
            <strong>Ways customers pay</strong>
            {methods.connected ? null : <span className="ui-badge ui-badge-warning">Connect Stripe</span>}
          </span>
          <small>
            {methods.connected
              ? "Cards, wallets, Cash App Pay, and Affirm — switch each on or off."
              : "Connect Stripe to switch on cards, wallets, Cash App Pay, and Affirm."}
          </small>
        </div>
        {methods.connected ? (
          <>
            <div className="pay-chips">
              {methods.options.map((option) => (
                <span
                  className={methods.enabledKeys.includes(option.key) ? "pay-chip pay-chip-on" : "pay-chip"}
                  key={option.key}>
                  <MethodMark methodKey={option.key} size={14} />
                  {option.label}
                </span>
              ))}
            </div>
            <div>
              <Button onClick={() => setActive({ kind: "methods" })} type="button" variant="secondary">
                <CreditCard size={16} />
                Manage ways to pay
              </Button>
            </div>
            <small className="muted-text">On now: {enabledMethodLabels.join(", ") || "none"}.</small>
          </>
        ) : (
          <>
            <div className="pay-chips">
              {methods.options.map((option) => (
                <span className="pay-chip pay-chip-locked" key={option.key}>
                  <Lock size={12} />
                  {option.label}
                </span>
              ))}
            </div>
            <div>
              <Button onClick={() => setActive({ kind: "connect", provider: "STRIPE" })} type="button">
                Set up Stripe
              </Button>
            </div>
          </>
        )}
      </section>

      {/* Checkout account -------------------------------------------------- */}
      <section className="subpanel form-grid">
        <div className="module-toggle-main">
          <span>
            <strong>Checkout account</strong>
            {checkout.anyConnected ? null : <span className="ui-badge ui-badge-warning">Connect a provider</span>}
          </span>
          <small>
            {checkout.anyConnected
              ? "The account that takes payment when customers check out."
              : "Connect a payment account above before customers can check out."}
          </small>
        </div>
        {checkout.disconnected ? (
          <p className="error ui-zero">
            <AlertTriangle size={14} /> Your selected checkout account is disconnected. Pick a connected one.
          </p>
        ) : null}
        {checkout.anyConnected ? (
          <div className="pay-checkout-row">
            <span className="pay-chip pay-chip-on">
              {checkout.providers.find((provider) => provider.value === checkout.active)?.label || "Not chosen"}
            </span>
            <Button onClick={() => setActive({ kind: "checkout" })} type="button" variant="secondary">
              <Settings2 size={16} />
              Change checkout account
            </Button>
          </div>
        ) : null}
        <div className="pay-checkout-row">
          <span className={checkoutTotals.taxEnabled ? "pay-chip pay-chip-on" : "pay-chip"}>{taxSummary}</span>
          <span className={checkoutTotals.shippingEnabled ? "pay-chip pay-chip-on" : "pay-chip"}>{shippingSummary}</span>
          <Button onClick={() => setActive({ kind: "checkoutTotals" })} type="button" variant="secondary">
            <ReceiptText size={16} />
            Checkout totals
          </Button>
        </div>
      </section>

      {active?.kind === "connect" && connectConfig ? (
        <ConnectWizard config={connectConfig} key={`connect-${active.provider}`} onClose={close} open={true} />
      ) : null}

      <Modal className="pay-dialog" onClose={close} open={simpleModalOpen} title={modalTitle}>
        {active?.kind === "manage" && manageProvider ? (
          <ManageProviderModal
            detail={manageProvider.manageDetail}
            key={`manage-${active.provider}`}
            name={manageProvider.name}
            onClose={close}
            onReplace={() => setActive({ kind: "connect", provider: manageProvider.provider })}
            provider={manageProvider.provider} />
        ) : null}
        {active?.kind === "methods" ? (
          <MethodsModal
            applePayStatus={methods.applePayStatus}
            enabledKeys={methods.enabledKeys}
            key="methods"
            onClose={close}
            options={methods.options} />
        ) : null}
        {active?.kind === "checkout" ? (
          <CheckoutModal active={checkout.active} key="checkout" onClose={close} providers={checkout.providers} />
        ) : null}
        {active?.kind === "checkoutTotals" ? (
          <CheckoutTotalsModal key="checkout-totals" onClose={close} settings={checkoutTotals} />
        ) : null}
        {active?.kind === "coupon" ? <CouponModal key="coupon" onClose={close} /> : null}
      </Modal>
    </div>
  );
}
