import { CheckCircle2, CreditCard } from "lucide-react";
import { PaymentProvider } from "@prisma/client";
import { Button, ButtonAnchor, Card } from "@/components/ui";
import { updateCheckoutProviderAction, updateStripePaymentMethodsAction } from "../actions";

type StripeMethodOption = {
  key: string;
  label: string;
  stripePaymentMethod: string;
  type: string;
};

type ProviderState = {
  connected: boolean;
  ready: boolean;
  statusLabel: string;
  accountSummary?: string;
};

export type PaymentOnboardingProps = {
  stripe: ProviderState & {
    options: readonly StripeMethodOption[];
    enabledKeys: string[];
    applePayStatus?: string;
  };
  square: ProviderState;
  paypal: ProviderState;
  checkout: {
    activeProvider?: PaymentProvider;
    selectedProviderDisconnected: boolean;
  };
};

const providerCopy: Record<
  "STRIPE" | "SQUARE" | "PAYPAL",
  { label: string; href: string; recommended?: boolean; unlocks: string }
> = {
  STRIPE: {
    label: "Stripe",
    href: "/api/payments/stripe/connect/start",
    recommended: true,
    unlocks: "Cards, Apple Pay, Google Pay, Cash App Pay, and Affirm — all from one sign-in."
  },
  SQUARE: {
    label: "Square",
    href: "/api/payments/square/connect/start",
    unlocks: "Cards and wallets settled straight to your Square account."
  },
  PAYPAL: {
    label: "PayPal",
    href: "/api/payments/paypal/connect/start",
    unlocks: "PayPal and Pay Later checkout, settled to your PayPal balance."
  }
};

// One method label gets the friendly "included with Stripe" highlight in the guided flow.
const featuredMethodKeys = new Set(["CASH_APP_PAY", "AFFIRM"]);

function methodHelpText(option: StripeMethodOption) {
  if (option.key === "CASH_APP_PAY") return "Let customers pay with their Cash App balance. Included with Stripe.";
  if (option.key === "AFFIRM") return "Buy now, pay later in installments. Included with Stripe.";
  if (option.key === "KLARNA") return "Buy now, pay later with Klarna.";
  if (option.stripePaymentMethod === "card") return "Card-backed checkout, including saved cards and wallets.";
  return `Stripe Checkout method: ${option.stripePaymentMethod}.`;
}

function StepHeader({ done, index, title, summary }: { done: boolean; index: number; title: string; summary: string }) {
  return (
    <div className="guided-step-head">
      <span className={done ? "guided-step-index guided-step-index-done" : "guided-step-index"} aria-hidden="true">
        {done ? <CheckCircle2 size={18} /> : index}
      </span>
      <span className="module-toggle-main">
        <span>
          <strong>{title}</strong>
          <span className={done ? "ui-badge ui-badge-success" : "ui-badge"}>{done ? "Done" : "To do"}</span>
        </span>
        <small>{summary}</small>
      </span>
    </div>
  );
}

function ProviderRow({
  provider,
  state
}: {
  provider: "STRIPE" | "SQUARE" | "PAYPAL";
  state: ProviderState;
}) {
  const copy = providerCopy[provider];
  const connectLabel = state.connected ? `Reconnect ${copy.label}` : `Connect ${copy.label}`;

  return (
    <div className="module-toggle-row">
      <CreditCard aria-hidden="true" size={18} />
      <span className="module-toggle-main">
        <span>
          <strong>{copy.label}</strong>
          {copy.recommended ? <span className="ui-badge">Recommended</span> : null}
          <span className={state.connected ? "ui-badge ui-badge-success" : "ui-badge ui-badge-warning"}>
            {state.connected ? "Connected" : "Not connected"}
          </span>
        </span>
        <small>{copy.unlocks}</small>
        {state.connected && state.accountSummary ? <small>{state.accountSummary}</small> : null}
        {!state.connected && !state.ready ? <small>Ask your Showrunner admin to finish enabling {copy.label}.</small> : null}
      </span>
      {state.ready || state.connected ? (
        <ButtonAnchor href={copy.href} variant={copy.recommended ? undefined : "secondary"}>
          <CreditCard size={18} />
          {connectLabel}
        </ButtonAnchor>
      ) : (
        <Button disabled type="button" variant="secondary">
          <CreditCard size={18} />
          Not enabled
        </Button>
      )}
    </div>
  );
}

export function PaymentOnboarding({ stripe, square, paypal, checkout }: PaymentOnboardingProps) {
  const anyConnected = stripe.connected || square.connected || paypal.connected;
  const step1Done = anyConnected;
  const step2Done = anyConnected && (!stripe.connected || stripe.enabledKeys.length > 0);
  const step3Done = Boolean(checkout.activeProvider) && !checkout.selectedProviderDisconnected;
  const completed = [step1Done, step2Done, step3Done].filter(Boolean).length;

  const checkoutOptions = [
    { provider: PaymentProvider.STRIPE, label: "Stripe", connected: stripe.connected },
    { provider: PaymentProvider.SQUARE, label: "Square", connected: square.connected },
    { provider: PaymentProvider.PAYPAL, label: "PayPal", connected: paypal.connected }
  ];

  return (
    <Card as="section" minHeight="none" bodyClassName="form-grid">
      <div className="guided-header">
        <div>
          <h2 className="compact-title">Get paid</h2>
          <p className="ui-zero">
            Connect a payment account in a few clicks. You sign in with the provider on their own secure site — no API
            keys, no copy-paste. Cash App Pay and Affirm come included when you connect Stripe.
          </p>
        </div>
        <span className={completed === 3 ? "guided-progress guided-progress-done" : "guided-progress"}>
          {completed} of 3 done
        </span>
      </div>

      <ol className="guided-steps">
        <li className="subpanel form-grid">
          <StepHeader
            done={step1Done}
            index={1}
            title="Connect how you get paid"
            summary="Pick one or more processors. Stripe is the easiest and unlocks the most ways to pay."
          />
          <div className="module-toggle-grid">
            <ProviderRow provider="STRIPE" state={stripe} />
            <ProviderRow provider="SQUARE" state={square} />
            <ProviderRow provider="PAYPAL" state={paypal} />
          </div>
        </li>

        <li className="subpanel form-grid">
          <StepHeader
            done={step2Done}
            index={2}
            title="Turn on the ways customers pay"
            summary="Cards, wallets, Cash App Pay, and Affirm are ready as soon as Stripe is connected."
          />
          {stripe.connected ? (
            <form action={updateStripePaymentMethodsAction} className="module-toggle-grid">
              {stripe.options.map((option) => {
                const checked = stripe.enabledKeys.includes(option.key);
                const applePayStatus = option.key === "APPLE_PAY" ? stripe.applePayStatus : "";

                return (
                  <label className="module-toggle-row" key={option.key}>
                    <input name="stripePaymentMethods" type="checkbox" value={option.key} defaultChecked={checked} />
                    <span className="module-toggle-main">
                      <span>
                        <strong>{option.label}</strong>
                        <span className="ui-badge">{option.type}</span>
                        {featuredMethodKeys.has(option.key) ? <span className="ui-badge ui-badge-success">Included</span> : null}
                        {applePayStatus ? (
                          <span className={applePayStatus === "verified" ? "ui-badge ui-badge-success" : "ui-badge ui-badge-warning"}>
                            {applePayStatus}
                          </span>
                        ) : null}
                      </span>
                      <small>{methodHelpText(option)}</small>
                    </span>
                  </label>
                );
              })}
              <Button type="submit" variant="secondary">
                <CreditCard size={18} />
                Save ways to pay
              </Button>
            </form>
          ) : (
            <p className="ui-zero">
              {anyConnected
                ? "Your connected provider runs its own hosted checkout. Connect Stripe above to also offer Cash App Pay and Affirm."
                : "Connect Stripe in step 1 to switch on cards, wallets, Cash App Pay, and Affirm — all included, no extra setup."}
            </p>
          )}
        </li>

        <li className="subpanel form-grid">
          <StepHeader
            done={step3Done}
            index={3}
            title="Choose which account runs checkout"
            summary="When more than one provider is connected, pick the one that takes payments at checkout."
          />
          {checkout.selectedProviderDisconnected ? (
            <p className="error ui-zero">Connect a payment provider before using hosted public checkout.</p>
          ) : null}
          <form action={updateCheckoutProviderAction} className="module-toggle-grid">
            {checkoutOptions.map((option) => (
              <label className="module-toggle-row" key={option.provider}>
                <input
                  disabled={!option.connected}
                  name="checkoutProvider"
                  type="radio"
                  value={option.provider}
                  defaultChecked={checkout.activeProvider === option.provider} />
                <span className="module-toggle-main">
                  <span>
                    <strong>{option.label}</strong>
                    <span className={option.connected ? "ui-badge ui-badge-success" : "ui-badge ui-badge-warning"}>
                      {option.connected ? "Connected" : "Connect first"}
                    </span>
                  </span>
                  <small>
                    {option.connected
                      ? `Take payments through your connected ${option.label} account.`
                      : `Connect ${option.label} above to choose it for checkout.`}
                  </small>
                </span>
              </label>
            ))}
            <Button disabled={!anyConnected} type="submit" variant="secondary">
              <CreditCard size={18} />
              Save checkout choice
            </Button>
          </form>
        </li>
      </ol>
    </Card>
  );
}
