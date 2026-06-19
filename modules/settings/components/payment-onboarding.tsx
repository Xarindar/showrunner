import { CheckCircle2, CreditCard, ExternalLink, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { PaymentGatewayConnectionStatus, type PaymentGatewayCredential, PaymentProvider } from "@prisma/client";
import { Button, Cluster, Field, Input, Select } from "@/components/ui";
import {
  disconnectPaymentProviderAction,
  reverifyPaymentProviderAction,
  savePayPalCredentialsAction,
  saveSquareCredentialsAction,
  saveStripeCredentialsAction,
  updateCheckoutProviderAction,
  updateStripePaymentMethodsAction
} from "../actions";

type Credential = PaymentGatewayCredential | null;

type StripeMethodOption = {
  key: string;
  label: string;
  stripePaymentMethod: string;
  type: string;
};

export type PaymentOnboardingProps = {
  checkout: {
    activeProvider?: PaymentProvider;
    selectedProviderDisconnected: boolean;
  };
  paypalCredential: Credential;
  publicBaseUrl: string;
  squareCredential: Credential;
  stripeCredential: Credential;
  stripeMethods: {
    applePayStatus?: string;
    enabledKeys: string[];
    options: readonly StripeMethodOption[];
  };
};

// One method label gets the friendly "included with Stripe" highlight in the guided flow.
const featuredMethodKeys = new Set(["CASH_APP_PAY", "AFFIRM"]);

function metadataString(credential: Credential, key: string) {
  const metadata = credential?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function isConnected(credential: Credential, requireField: (credential: PaymentGatewayCredential) => boolean) {
  return Boolean(credential && credential.status !== PaymentGatewayConnectionStatus.DISCONNECTED && requireField(credential));
}

function lastVerifiedLabel(credential: Credential) {
  return credential?.lastVerifiedAt ? `Last checked ${credential.lastVerifiedAt.toISOString().slice(0, 10)}` : "";
}

function methodHelpText(option: StripeMethodOption) {
  if (option.key === "CASH_APP_PAY") return "Let customers pay with their Cash App balance. Included with Stripe.";
  if (option.key === "AFFIRM") return "Buy now, pay later in installments. Included with Stripe.";
  if (option.key === "KLARNA") return "Buy now, pay later with Klarna.";
  if (option.stripePaymentMethod === "card") return "Card-backed checkout, including saved cards and wallets.";
  return `Stripe Checkout method: ${option.stripePaymentMethod}.`;
}

function StepHeader({ done, index, summary, title }: { done: boolean; index: number; summary: string; title: string }) {
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

function StatusBadge({ connected, status }: { connected: boolean; status?: PaymentGatewayConnectionStatus }) {
  if (connected && status === PaymentGatewayConnectionStatus.ERROR) {
    return <span className="ui-badge ui-badge-warning">Needs attention</span>;
  }
  if (connected) return <span className="ui-badge ui-badge-success">Connected</span>;
  return <span className="ui-badge ui-badge-warning">Not connected</span>;
}

function ManageRow({ provider }: { provider: PaymentProvider }) {
  return (
    <Cluster gap="2">
      <form action={reverifyPaymentProviderAction}>
        <input type="hidden" name="provider" value={provider} />
        <Button type="submit" variant="secondary">
          <RefreshCw size={16} />
          Re-check connection
        </Button>
      </form>
      <form action={disconnectPaymentProviderAction}>
        <input type="hidden" name="provider" value={provider} />
        <Button type="submit" variant="secondary">
          <Unplug size={16} />
          Disconnect
        </Button>
      </form>
    </Cluster>
  );
}

export function PaymentOnboarding({
  checkout,
  paypalCredential,
  publicBaseUrl,
  squareCredential,
  stripeCredential,
  stripeMethods
}: PaymentOnboardingProps) {
  const stripeConnected = isConnected(stripeCredential, (credential) => Boolean(credential.externalAccountId));
  const squareConnected = isConnected(squareCredential, (credential) => Boolean(credential.merchantId || credential.encryptedAccessToken));
  const paypalConnected = isConnected(paypalCredential, (credential) => Boolean(credential.externalAccountId));
  const anyConnected = stripeConnected || squareConnected || paypalConnected;

  const stripeWebhookUrl = `${publicBaseUrl}/api/webhooks/stripe`;
  const squareWebhookUrl = `${publicBaseUrl}/api/webhooks/square`;
  const paypalWebhookUrl = `${publicBaseUrl}/api/webhooks/paypal`;

  const step1Done = anyConnected;
  const step2Done = anyConnected && (!stripeConnected || stripeMethods.enabledKeys.length > 0);
  const step3Done = Boolean(checkout.activeProvider) && !checkout.selectedProviderDisconnected;
  const completed = [step1Done, step2Done, step3Done].filter(Boolean).length;

  const checkoutOptions = [
    { connected: stripeConnected, label: "Stripe", provider: PaymentProvider.STRIPE },
    { connected: squareConnected, label: "Square", provider: PaymentProvider.SQUARE },
    { connected: paypalConnected, label: "PayPal", provider: PaymentProvider.PAYPAL }
  ];

  return (
    <section className="ui-card ui-card-density-normal ui-card-min-none">
      <div className="ui-card-body form-grid">
        <div className="guided-header">
          <div>
            <h2 className="compact-title">Get paid</h2>
            <p className="ui-zero">
              Connect your own payment accounts. You paste credentials from each provider&apos;s dashboard once; they are stored
              encrypted in your database and used to charge directly on your own account. Cash App Pay and Affirm are included
              when you connect Stripe.
            </p>
          </div>
          <span className={completed === 3 ? "guided-progress guided-progress-done" : "guided-progress"}>{completed} of 3 done</span>
        </div>

        <ol className="guided-steps">
          {/* Step 1 — connect your own provider accounts -------------------- */}
          <li className="subpanel form-grid">
            <StepHeader
              done={step1Done}
              index={1}
              title="Connect your payment accounts"
              summary="Paste credentials from each provider you want to offer. Stripe alone covers cards, wallets, Cash App Pay, and Affirm."
            />

            {/* Stripe */}
            <div className="subpanel form-grid">
              <div className="module-toggle-row">
                <CreditCard aria-hidden="true" size={18} />
                <span className="module-toggle-main">
                  <span>
                    <strong>Stripe</strong>
                    <span className="ui-badge">Recommended</span>
                    <StatusBadge connected={stripeConnected} status={stripeCredential?.status} />
                  </span>
                  <small>
                    {stripeConnected
                      ? `${stripeCredential?.displayName || "Stripe account"} · ${
                          metadataString(stripeCredential, "keyMode") === "live" ? "Live keys" : "Test keys"
                        }${stripeCredential?.webhookSecretHint ? ` · webhook ${stripeCredential.webhookSecretHint}` : ""}. ${lastVerifiedLabel(stripeCredential)}`
                      : "Cards, Apple Pay, Google Pay, Cash App Pay, and Affirm — all from one Stripe connection."}
                  </small>
                </span>
              </div>
              {stripeConnected ? <ManageRow provider={PaymentProvider.STRIPE} /> : null}
              <details className="subpanel" open={!stripeConnected}>
                <summary>
                  <ShieldCheck aria-hidden="true" size={16} /> {stripeConnected ? "Replace Stripe credentials" : "How to connect Stripe"}
                </summary>
                <div className="form-grid">
                  <ol>
                    <li>
                      Open the{" "}
                      <a href="https://dashboard.stripe.com/apikeys" rel="noreferrer" target="_blank">
                        Stripe API keys page <ExternalLink size={12} />
                      </a>{" "}
                      and copy your <strong>Secret key</strong> (<code>sk_live_…</code>).
                    </li>
                    <li>
                      Add a webhook at Developers → Webhooks pointing at <code>{stripeWebhookUrl}</code>, sending{" "}
                      <code>checkout.session.completed</code>, <code>checkout.session.async_payment_succeeded</code>,{" "}
                      <code>checkout.session.expired</code>, <code>payment_intent.payment_failed</code>, and{" "}
                      <code>charge.refunded</code>. Copy its <strong>Signing secret</strong> (<code>whsec_…</code>).
                    </li>
                    <li>Turn on Cash App Pay and Affirm in your Stripe payment-method settings — they then appear automatically at checkout.</li>
                  </ol>
                  <form action={saveStripeCredentialsAction} className="form-grid">
                    <Field label="Stripe secret key" hint="Starts with sk_live_ / sk_test_ (or a restricted rk_ key).">
                      <Input name="stripeApiKey" type="password" autoComplete="off" placeholder="sk_live_…" required />
                    </Field>
                    <Field label="Webhook signing secret" hint="Starts with whsec_.">
                      <Input name="stripeWebhookSecret" type="password" autoComplete="off" placeholder="whsec_…" required />
                    </Field>
                    <Button type="submit">
                      <CreditCard size={18} />
                      Save &amp; verify Stripe
                    </Button>
                  </form>
                </div>
              </details>
            </div>

            {/* Square */}
            <div className="subpanel form-grid">
              <div className="module-toggle-row">
                <CreditCard aria-hidden="true" size={18} />
                <span className="module-toggle-main">
                  <span>
                    <strong>Square</strong>
                    <StatusBadge connected={squareConnected} status={squareCredential?.status} />
                  </span>
                  <small>
                    {squareConnected
                      ? `${squareCredential?.displayName || "Square"} · ${metadataString(squareCredential, "environment") || "production"}. ${lastVerifiedLabel(squareCredential)}`
                      : "Optional. Square checkout with cards, Apple Pay, Google Pay, and Cash App Pay."}
                  </small>
                </span>
              </div>
              {squareConnected ? <ManageRow provider={PaymentProvider.SQUARE} /> : null}
              <details className="subpanel" open={!squareConnected}>
                <summary>
                  <ShieldCheck aria-hidden="true" size={16} /> {squareConnected ? "Replace Square credentials" : "How to connect Square"}
                </summary>
                <div className="form-grid">
                  <ol>
                    <li>
                      In the{" "}
                      <a href="https://developer.squareup.com/apps" rel="noreferrer" target="_blank">
                        Square Developer dashboard <ExternalLink size={12} />
                      </a>
                      , open your application and copy the <strong>Access token</strong> for the environment you want.
                    </li>
                    <li>
                      Add a webhook pointing at <code>{squareWebhookUrl}</code> for <code>payment.updated</code> and{" "}
                      <code>refund.updated</code>, then copy its <strong>Signature key</strong>.
                    </li>
                  </ol>
                  <form action={saveSquareCredentialsAction} className="form-grid">
                    <Field label="Environment" hint="Match the access token you copied.">
                      <Select name="squareEnvironment" defaultValue={metadataString(squareCredential, "environment") || "production"}>
                        <option value="production">Production</option>
                        <option value="sandbox">Sandbox</option>
                      </Select>
                    </Field>
                    <Field label="Access token" hint="From your Square application.">
                      <Input name="squareAccessToken" type="password" autoComplete="off" placeholder="EAAA…" required />
                    </Field>
                    <Field label="Webhook signature key" hint="From your Square webhook subscription.">
                      <Input name="squareWebhookSignatureKey" type="password" autoComplete="off" required />
                    </Field>
                    <Field label="Location ID (optional)" hint="Leave blank to use your first active location.">
                      <Input name="squareLocationId" type="text" autoComplete="off" placeholder="L…" />
                    </Field>
                    <Button type="submit" variant="secondary">
                      <CreditCard size={18} />
                      Save &amp; verify Square
                    </Button>
                  </form>
                </div>
              </details>
            </div>

            {/* PayPal */}
            <div className="subpanel form-grid">
              <div className="module-toggle-row">
                <CreditCard aria-hidden="true" size={18} />
                <span className="module-toggle-main">
                  <span>
                    <strong>PayPal</strong>
                    <StatusBadge connected={paypalConnected} status={paypalCredential?.status} />
                  </span>
                  <small>
                    {paypalConnected
                      ? `${metadataString(paypalCredential, "environment") === "live" ? "Live" : "Sandbox"} app connected. ${lastVerifiedLabel(paypalCredential)}`
                      : "Optional. PayPal checkout settled to your own PayPal business account."}
                  </small>
                </span>
              </div>
              {paypalConnected ? <ManageRow provider={PaymentProvider.PAYPAL} /> : null}
              <details className="subpanel" open={!paypalConnected}>
                <summary>
                  <ShieldCheck aria-hidden="true" size={16} /> {paypalConnected ? "Replace PayPal credentials" : "How to connect PayPal"}
                </summary>
                <div className="form-grid">
                  <ol>
                    <li>
                      In the{" "}
                      <a href="https://developer.paypal.com/dashboard/applications" rel="noreferrer" target="_blank">
                        PayPal Developer dashboard <ExternalLink size={12} />
                      </a>
                      , create (or open) a REST app and copy its <strong>Client ID</strong> and <strong>Secret</strong>.
                    </li>
                    <li>
                      Add a webhook pointing at <code>{paypalWebhookUrl}</code> for <code>CHECKOUT.ORDER.APPROVED</code> and the{" "}
                      <code>PAYMENT.CAPTURE.*</code> events, then copy its <strong>Webhook ID</strong>.
                    </li>
                  </ol>
                  <form action={savePayPalCredentialsAction} className="form-grid">
                    <Field label="Environment" hint="Use Live for real payments.">
                      <Select name="paypalEnvironment" defaultValue={metadataString(paypalCredential, "environment") || "live"}>
                        <option value="live">Live</option>
                        <option value="sandbox">Sandbox</option>
                      </Select>
                    </Field>
                    <Field label="Client ID" hint="From your PayPal REST app.">
                      <Input name="paypalClientId" type="text" autoComplete="off" required />
                    </Field>
                    <Field label="Secret" hint="From your PayPal REST app.">
                      <Input name="paypalClientSecret" type="password" autoComplete="off" required />
                    </Field>
                    <Field label="Webhook ID" hint="From the webhook you created above.">
                      <Input name="paypalWebhookId" type="text" autoComplete="off" required />
                    </Field>
                    <Button type="submit" variant="secondary">
                      <CreditCard size={18} />
                      Save &amp; verify PayPal
                    </Button>
                  </form>
                </div>
              </details>
            </div>
          </li>

          {/* Step 2 — ways to pay ------------------------------------------ */}
          <li className="subpanel form-grid">
            <StepHeader
              done={step2Done}
              index={2}
              title="Turn on the ways customers pay"
              summary="Cards, wallets, Cash App Pay, and Affirm are ready as soon as Stripe is connected."
            />
            {stripeConnected ? (
              <form action={updateStripePaymentMethodsAction} className="module-toggle-grid">
                {stripeMethods.options.map((option) => {
                  const checked = stripeMethods.enabledKeys.includes(option.key);
                  const applePayStatus = option.key === "APPLE_PAY" ? stripeMethods.applePayStatus : "";

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

          {/* Step 3 — checkout provider ------------------------------------ */}
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
      </div>
    </section>
  );
}
