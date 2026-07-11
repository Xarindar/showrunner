"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, TicketPlus, TriangleAlert, X, Zap } from "lucide-react";
import { Button, Modal, SettingRow, SettingsGroup, Table } from "@/components/ui";
import { ProviderMark } from "./brand-marks";
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
  // One-click OAuth connect through the AdmitOne Connect broker (Stripe/Square only).
  oauthConnect?: boolean;
  // Rendered as the de-emphasized "paste your own keys" option (PayPal when OAuth is on).
  advanced?: boolean;
  // Connected but no webhook secret stored: Square OAuth needs a signature key pasted
  // once; Stripe only hits this when automatic webhook creation failed (fix = reconnect).
  webhookMissing?: boolean;
};

export type ConnectNotice = { kind: "success" | "error"; message: string };

function connectStartHref(provider: ProviderKey) {
  return `/api/payments/connect/${provider.toLowerCase()}/start`;
}

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
  notice?: ConnectNotice | null;
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
  methods,
  notice,
  providers,
  webhooks
}: PaymentsWorkspaceProps) {
  const [active, setActive] = useState<ActiveModal>(null);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const close = () => setActive(null);
  const oneClickAvailable = providers.some((provider) => provider.oauthConnect);

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
              ? "Tax & shipping"
              : active?.kind === "coupon"
                ? "Add coupon"
                : "";

  const taxSummary = checkoutTotals.taxEnabled
    ? `${checkoutTotals.taxLabel} ${percentLabel(checkoutTotals.taxRateBps)}`
    : "Tax off";
  const shippingSummary = checkoutTotals.shippingEnabled
    ? `${checkoutTotals.shippingLabel} ${moneyLabel(checkoutTotals.shippingFlatCents)}`
    : "Shipping off";
  const activeCheckoutLabel = checkout.providers.find((provider) => provider.value === checkout.active)?.label;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Payments</p>
          <h1>Payments</h1>
          <p>
            {oneClickAvailable
              ? "Connect your own payment accounts with one click and choose how customers pay. Tokens are stored encrypted, and charges settle directly to your own account."
              : "Connect your own payment accounts and choose how customers pay. Credentials are verified live, stored encrypted, and charges settle to your own account."}
          </p>
        </div>
        <span className={done === steps.length ? "guided-progress guided-progress-done" : "guided-progress"}>
          {done} of {steps.length} set up
        </span>
      </header>

      {notice && !noticeDismissed ? (
        <div className={`pay-connect-notice ${notice.kind === "success" ? "success-message" : "error"}`} role="status">
          {notice.kind === "success" ? <CheckCircle2 size={16} /> : <TriangleAlert size={16} />}
          <span>{notice.message}</span>
          <Button aria-label="Dismiss" onClick={() => setNoticeDismissed(true)} size="sm" type="button" variant="ghost">
            <X size={14} />
          </Button>
        </div>
      ) : null}

      {/* Setup state and next actions; every detail opens in a modal ------- */}
      <SettingsGroup
        description="Connect an account, switch on ways to pay, and choose which account runs checkout."
        title="Payment setup">
        {providers.map((provider) => (
          <SettingRow
            description={provider.connected ? provider.manageDetail : provider.headline}
            key={provider.provider}
            title={
              <span className="pay-row-title">
                <ProviderMark provider={provider.provider} size={18} />
                {provider.name}
                {provider.connected ? (
                  <span className={provider.needsAttention ? "ui-badge ui-badge-warning" : "ui-badge ui-badge-success"}>
                    {provider.needsAttention ? "Needs attention" : "Connected"}
                  </span>
                ) : provider.recommended ? (
                  <span className="ui-badge">Recommended</span>
                ) : null}
                {provider.connected && provider.webhookMissing ? (
                  <span className="ui-badge ui-badge-warning">
                    {provider.provider === "SQUARE" ? "Add webhook key" : "Webhook needs setup"}
                  </span>
                ) : null}
              </span>
            }>
            {provider.connected ? (
              <Button onClick={() => setActive({ kind: "manage", provider: provider.provider })} size="sm" type="button" variant="secondary">
                Manage
              </Button>
            ) : provider.oauthConnect ? (
              // One-click OAuth: a real navigation to the start route (which redirects to the
              // provider's hosted login), so this must be an anchor rather than a modal trigger.
              <span className="pay-row-title">
                <Button
                  onClick={() => setActive({ kind: "connect", provider: provider.provider })}
                  size="sm"
                  type="button"
                  variant="ghost">
                  Paste keys
                </Button>
                <a
                  className={`ui-button ui-button-sm${provider.recommended && connectedCount === 0 ? "" : " ui-button-secondary"}`}
                  href={connectStartHref(provider.provider)}>
                  <Zap size={15} />
                  Connect
                </a>
              </span>
            ) : (
              <Button
                onClick={() => setActive({ kind: "connect", provider: provider.provider })}
                size="sm"
                type="button"
                variant={provider.recommended && connectedCount === 0 && !provider.advanced ? undefined : "secondary"}>
                {provider.advanced ? "Connect (paste keys)" : "Connect"}
              </Button>
            )}
          </SettingRow>
        ))}

        <SettingRow
          description={
            methods.connected
              ? `On now: ${enabledMethodLabels.join(", ") || "none"}. Cash App Pay and Affirm are included with Stripe — no separate accounts to create.`
              : "Cards, wallets, Cash App Pay, and Affirm all come from the Stripe connection. Connect Stripe above to switch them on."
          }
          title={
            <span className="pay-row-title">
              Ways customers pay
              {methods.connected ? (
                <span className="ui-badge ui-badge-success">{methods.enabledKeys.length} on</span>
              ) : (
                <span className="ui-badge ui-badge-warning">Waiting on Stripe</span>
              )}
            </span>
          }>
          {methods.connected ? (
            <Button onClick={() => setActive({ kind: "methods" })} size="sm" type="button" variant="secondary">
              Manage
            </Button>
          ) : null}
        </SettingRow>

        <SettingRow
          description={
            checkout.disconnected
              ? "The selected account is disconnected, so checkout cannot take payment. Pick a connected account."
              : checkout.anyConnected
                ? "The account that takes payment when customers check out."
                : "Connect a payment account above before customers can check out."
          }
          title={
            <span className="pay-row-title">
              Checkout account
              {checkout.disconnected ? (
                <span className="ui-badge ui-badge-danger">Disconnected</span>
              ) : checkout.anyConnected && activeCheckoutLabel ? (
                <span className="ui-badge ui-badge-success">{activeCheckoutLabel}</span>
              ) : (
                <span className="ui-badge ui-badge-warning">Waiting on a connection</span>
              )}
            </span>
          }>
          {checkout.anyConnected ? (
            <Button onClick={() => setActive({ kind: "checkout" })} size="sm" type="button" variant="secondary">
              Change
            </Button>
          ) : null}
        </SettingRow>

        <SettingRow
          description={`${taxSummary} · ${shippingSummary} — shown in cart and checkout totals.`}
          title="Tax & shipping">
          <Button onClick={() => setActive({ kind: "checkoutTotals" })} size="sm" type="button" variant="secondary">
            Edit
          </Button>
        </SettingRow>
      </SettingsGroup>

      {/* Coupons: the primary dense surface -------------------------------- */}
      <section aria-labelledby="active-coupons-title" className="ui-data-table-shell payments-coupons-table">
        <div className="ui-data-table-header">
          <div className="ui-data-table-titlebar">
            <div>
              <h2 className="section-title" id="active-coupons-title">
                Active coupons
              </h2>
              <p className="ui-zero">{coupons.length} available at checkout</p>
            </div>
            <Button onClick={() => setActive({ kind: "coupon" })} size="sm" type="button">
              <TicketPlus size={16} />
              Add coupon
            </Button>
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

      {active?.kind === "connect" && connectConfig ? (
        <ConnectWizard config={connectConfig} key={`connect-${active.provider}`} onClose={close} open={true} />
      ) : null}

      <Modal className="pay-dialog" onClose={close} open={simpleModalOpen} title={modalTitle}>
        {active?.kind === "manage" && manageProvider ? (
          <ManageProviderModal
            detail={manageProvider.manageDetail}
            key={`manage-${active.provider}`}
            name={manageProvider.name}
            oauthReconnectHref={manageProvider.oauthConnect ? connectStartHref(manageProvider.provider) : undefined}
            onClose={close}
            onReplace={() => setActive({ kind: "connect", provider: manageProvider.provider })}
            provider={manageProvider.provider}
            webhookMissing={manageProvider.webhookMissing} />
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
