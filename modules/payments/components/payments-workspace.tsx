"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, Lock, Settings2 } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { MethodMark, ProviderMark } from "./brand-marks";
import { buildConnectWizards, ConnectWizard, type WebhookUrls } from "./connect-wizard";
import { CheckoutModal, ManageProviderModal, MethodsModal, type MethodOption } from "./manage-modals";

type ProviderKey = "STRIPE" | "SQUARE" | "PAYPAL";

export type ProviderCard = {
  provider: ProviderKey;
  name: string;
  recommended?: boolean;
  connected: boolean;
  needsAttention: boolean;
  headline: string;
  manageDetail: string;
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
  featuredConnected: boolean;
  webhooks: WebhookUrls;
};

type ActiveModal =
  | { kind: "connect"; provider: ProviderKey }
  | { kind: "manage"; provider: ProviderKey }
  | { kind: "methods" }
  | { kind: "checkout" }
  | null;

export function PaymentsWorkspace({ checkout, featuredConnected, methods, providers, webhooks }: PaymentsWorkspaceProps) {
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
            : "";

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
        <span className={done === steps.length ? "guided-progress guided-progress-done" : "guided-progress"}>
          {done} of {steps.length} set up
        </span>
      </header>

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
      <section className="form-grid">
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
      </Modal>
    </div>
  );
}
