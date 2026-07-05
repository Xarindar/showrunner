"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, KeyRound, Loader2, Plus, ReceiptText, RefreshCw, TicketPercent, Unplug, Webhook, Zap } from "lucide-react";
import { Button, Field, Input, Switch, SwitchReveal } from "@/components/ui";
import { MethodMark } from "./brand-marks";
import {
  createCouponAction,
  disconnectProviderAction,
  reverifyProviderAction,
  savePaymentMethodsAction,
  saveSquareWebhookKeyAction,
  setCheckoutProviderAction,
  updateCheckoutTotalsAction
} from "../actions";
import { initialPaymentActionState } from "../state";

export type MethodOption = { key: string; label: string; type: string; stripePaymentMethod: string };
export type CheckoutTotalsSettings = {
  freeShippingThresholdCents: number | null;
  shippingEnabled: boolean;
  shippingFlatCents: number | null;
  shippingLabel: string;
  taxAppliesToShipping: boolean;
  taxEnabled: boolean;
  taxLabel: string;
  taxRateBps: number | null;
};

const featuredMethodKeys = new Set(["CASH_APP_PAY", "AFFIRM"]);

function moneyInput(cents?: number | null) {
  return typeof cents === "number" ? (cents / 100).toFixed(2) : "";
}

function percentInput(basisPoints?: number | null) {
  return typeof basisPoints === "number" ? (basisPoints / 100).toFixed(2) : "";
}

function methodHelpText(option: MethodOption) {
  if (option.key === "CASH_APP_PAY") return "Pay from a Cash App balance. Included with Stripe.";
  if (option.key === "AFFIRM") return "Buy now, pay later in installments. Included with Stripe.";
  if (option.key === "KLARNA") return "Buy now, pay later with Klarna.";
  if (option.stripePaymentMethod === "card") return "Card checkout, including saved cards and wallets.";
  return `Stripe Checkout method: ${option.stripePaymentMethod}.`;
}

export function MethodsModal({
  applePayStatus,
  enabledKeys,
  onClose,
  options
}: {
  applePayStatus?: string;
  enabledKeys: string[];
  onClose: () => void;
  options: MethodOption[];
}) {
  const [state, formAction, pending] = useActionState(savePaymentMethodsAction, initialPaymentActionState);

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state.status, onClose]);

  return (
    <form action={formAction} className="form-grid">
      <p className="pay-step-lead">
        Switch payment methods on or off. Cash App Pay and Affirm are included with Stripe — no extra setup.
      </p>
      <div className="module-toggle-grid">
        {options.map((option) => {
          const checked = enabledKeys.includes(option.key);
          const showApplePay = option.key === "APPLE_PAY" ? applePayStatus : "";
          return (
            <div className="module-toggle-row" key={option.key}>
              <Switch aria-label={`Enable ${option.label}`} defaultChecked={checked} name="stripePaymentMethods" value={option.key} />
              <span className="module-toggle-main">
                <span>
                  <MethodMark methodKey={option.key} size={15} />
                  <strong>{option.label}</strong>
                  <span className="ui-badge">{option.type}</span>
                  {featuredMethodKeys.has(option.key) ? <span className="ui-badge ui-badge-success">Included</span> : null}
                  {showApplePay ? (
                    <span className={showApplePay === "verified" ? "ui-badge ui-badge-success" : "ui-badge ui-badge-warning"}>
                      {showApplePay}
                    </span>
                  ) : null}
                </span>
                <small>{methodHelpText(option)}</small>
              </span>
            </div>
          );
        })}
      </div>
      {state.status === "error" ? <p className="error ui-zero">{state.message}</p> : null}
      <div className="pay-step-actions">
        <Button onClick={onClose} type="button" variant="secondary">
          Cancel
        </Button>
        <Button aria-busy={pending} disabled={pending} type="submit">
          {pending ? <Loader2 className="pay-spin" size={18} /> : <CreditCard size={18} />}
          Save ways to pay
        </Button>
      </div>
    </form>
  );
}

export function CouponModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createCouponAction, initialPaymentActionState);

  useEffect(() => {
    if (state.status !== "success") return;
    router.refresh();
    onClose();
  }, [onClose, router, state.status]);

  return (
    <form action={formAction} className="form-grid">
      <p className="pay-step-lead">
        Create a reusable checkout discount code. Percent coupons use the percent field; fixed amount coupons use the fixed amount field.
      </p>
      <div className="module-toggle-grid">
        <div className="module-toggle-row">
          <Switch aria-label="Active at checkout" name="isActive" defaultChecked />
          <span className="module-toggle-main">
            <span>
              <TicketPercent size={15} />
              <strong>Active at checkout</strong>
            </span>
            <small>Active coupons can be entered by customers in the cart.</small>
          </span>
        </div>
      </div>
      <div className="form-grid">
        <div className="ui-field">
          <label htmlFor="couponCode">Code</label>
          <input autoCapitalize="characters" id="couponCode" name="code" placeholder="WELCOME10" required />
        </div>
        <div className="ui-field">
          <label htmlFor="couponType">Type</label>
          <select id="couponType" name="type" defaultValue="PERCENT">
            <option value="PERCENT">percent</option>
            <option value="FIXED">fixed amount</option>
          </select>
        </div>
        <div className="ui-field">
          <label htmlFor="percentOff">Percent off</label>
          <input id="percentOff" name="percentOff" min="0" max="100" placeholder="10" type="number" />
        </div>
        <div className="ui-field">
          <label htmlFor="amount">Fixed amount</label>
          <input id="amount" name="amount" inputMode="decimal" placeholder="25.00" />
        </div>
        <div className="ui-field">
          <label htmlFor="maxRedemptions">Max redemptions</label>
          <input id="maxRedemptions" name="maxRedemptions" min="0" placeholder="No limit" type="number" />
        </div>
      </div>
      {state.status === "error" ? <p className="error ui-zero">{state.message}</p> : null}
      <div className="pay-step-actions">
        <Button onClick={onClose} type="button" variant="secondary">
          Cancel
        </Button>
        <Button aria-busy={pending} disabled={pending} type="submit">
          {pending ? <Loader2 className="pay-spin" size={18} /> : <Plus size={18} />}
          Add coupon
        </Button>
      </div>
    </form>
  );
}

export function CheckoutModal({
  active,
  onClose,
  providers
}: {
  active?: string;
  onClose: () => void;
  providers: { value: string; label: string; connected: boolean }[];
}) {
  const [state, formAction, pending] = useActionState(setCheckoutProviderAction, initialPaymentActionState);

  useEffect(() => {
    if (state.status === "success") onClose();
  }, [state.status, onClose]);

  return (
    <form action={formAction} className="form-grid">
      <p className="pay-step-lead">
        When more than one account is connected, pick the one that takes payment at checkout.
      </p>
      <div className="module-toggle-grid">
        {providers.map((provider) => (
          <label className="module-toggle-row" key={provider.value}>
            <input
              defaultChecked={active === provider.value}
              disabled={!provider.connected}
              name="checkoutProvider"
              type="radio"
              value={provider.value} />
            <span className="module-toggle-main">
              <span>
                <strong>{provider.label}</strong>
                <span className={provider.connected ? "ui-badge ui-badge-success" : "ui-badge ui-badge-warning"}>
                  {provider.connected ? "Connected" : "Connect first"}
                </span>
              </span>
              <small>
                {provider.connected
                  ? `Take payment through your connected ${provider.label} account.`
                  : `Connect ${provider.label} to choose it for checkout.`}
              </small>
            </span>
          </label>
        ))}
      </div>
      {state.status === "error" ? <p className="error ui-zero">{state.message}</p> : null}
      <div className="pay-step-actions">
        <Button onClick={onClose} type="button" variant="secondary">
          Cancel
        </Button>
        <Button aria-busy={pending} disabled={pending} type="submit">
          {pending ? <Loader2 className="pay-spin" size={18} /> : <CreditCard size={18} />}
          Save checkout choice
        </Button>
      </div>
    </form>
  );
}

export function CheckoutTotalsModal({
  onClose,
  settings
}: {
  onClose: () => void;
  settings: CheckoutTotalsSettings;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateCheckoutTotalsAction, initialPaymentActionState);

  useEffect(() => {
    if (state.status !== "success") return;
    router.refresh();
    onClose();
  }, [onClose, router, state.status]);

  return (
    <form action={formAction} className="form-grid">
      <p className="pay-step-lead">
        Set the tax rule and standard shipping amount customers see in cart and checkout.
      </p>
      <div className="ui-switch-reveal-list">
        <SwitchReveal
          defaultChecked={settings.taxEnabled}
          description="Apply a site-wide tax rate during checkout."
          label="Enable tax"
          name="commerceTaxEnabled">
          <div className="ui-reveal-grid is-two">
            <div className="ui-field">
              <label htmlFor="commerceTaxLabel">Tax label</label>
              <input id="commerceTaxLabel" name="commerceTaxLabel" defaultValue={settings.taxLabel} required />
            </div>
            <div className="ui-field">
              <label htmlFor="commerceTaxRate">Tax rate %</label>
              <input id="commerceTaxRate" name="commerceTaxRate" inputMode="decimal" defaultValue={percentInput(settings.taxRateBps)} />
            </div>
          </div>
          <Switch
            className="ui-reveal-check"
            defaultChecked={settings.taxAppliesToShipping}
            label="Tax shipping"
            name="commerceTaxAppliesToShipping"
            variant="inline"
          />
        </SwitchReveal>
        <SwitchReveal
          defaultChecked={settings.shippingEnabled}
          description="Show a standard shipping line for physical items."
          label="Enable standard shipping"
          name="commerceShippingEnabled">
          <div className="ui-reveal-grid is-three">
            <div className="ui-field">
              <label htmlFor="commerceShippingLabel">Shipping label</label>
              <input id="commerceShippingLabel" name="commerceShippingLabel" defaultValue={settings.shippingLabel} required />
            </div>
            <div className="ui-field">
              <label htmlFor="commerceShippingFlat">Flat amount</label>
              <input
                id="commerceShippingFlat"
                name="commerceShippingFlat"
                inputMode="decimal"
                defaultValue={moneyInput(settings.shippingFlatCents)} />
            </div>
            <div className="ui-field">
              <label htmlFor="commerceFreeShippingThreshold">Free shipping threshold</label>
              <input
                id="commerceFreeShippingThreshold"
                name="commerceFreeShippingThreshold"
                inputMode="decimal"
                defaultValue={moneyInput(settings.freeShippingThresholdCents)} />
            </div>
          </div>
        </SwitchReveal>
      </div>
      {state.status === "error" ? <p className="error ui-zero">{state.message}</p> : null}
      <div className="pay-step-actions">
        <Button onClick={onClose} type="button" variant="secondary">
          Cancel
        </Button>
        <Button aria-busy={pending} disabled={pending} type="submit">
          {pending ? <Loader2 className="pay-spin" size={18} /> : <ReceiptText size={18} />}
          Save checkout totals
        </Button>
      </div>
    </form>
  );
}

export function ManageProviderModal({
  detail,
  name,
  oauthReconnectHref,
  onClose,
  onReplace,
  provider,
  webhookMissing
}: {
  detail: string;
  name: string;
  oauthReconnectHref?: string;
  onClose: () => void;
  onReplace?: () => void;
  provider: string;
  webhookMissing?: boolean;
}) {
  const [recheckState, recheckAction, recheckPending] = useActionState(reverifyProviderAction, initialPaymentActionState);
  const [webhookKeyState, webhookKeyAction, webhookKeyPending] = useActionState(
    saveSquareWebhookKeyAction,
    initialPaymentActionState
  );
  const [disconnectState, disconnectAction, disconnectPending] = useActionState(
    disconnectProviderAction,
    initialPaymentActionState
  );

  useEffect(() => {
    if (disconnectState.status === "success") onClose();
  }, [disconnectState.status, onClose]);

  return (
    <div className="form-grid">
      <p className="pay-step-lead">{detail}</p>

      {recheckState.status === "success" ? (
        <p className="success-message ui-zero">{name} is responding. Connection re-checked.</p>
      ) : null}
      {recheckState.status === "error" ? <p className="error ui-zero">{recheckState.message}</p> : null}
      {disconnectState.status === "error" ? <p className="error ui-zero">{disconnectState.message}</p> : null}

      {provider === "STRIPE" && webhookMissing ? (
        <p className="error ui-zero">
          Stripe is connected, but the payment webhook could not be created automatically, so payment
          updates will not arrive. Click &quot;Reconnect with Stripe&quot; to retry the webhook setup.
        </p>
      ) : null}

      {provider === "SQUARE" && webhookMissing && webhookKeyState.status !== "success" ? (
        <form action={webhookKeyAction} className="form-grid">
          <Field
            hint="One-click connect stores your Square tokens, but Square only shares webhook signature keys in its Developer dashboard. Paste the key for the webhook subscription that points at this site."
            label="Square webhook signature key">
            <Input autoComplete="off" name="squareWebhookSignatureKey" placeholder="Signature key" type="password" />
          </Field>
          {webhookKeyState.status === "error" ? <p className="error ui-zero">{webhookKeyState.message}</p> : null}
          <Button aria-busy={webhookKeyPending} disabled={webhookKeyPending} size="sm" type="submit" variant="secondary">
            {webhookKeyPending ? <Loader2 className="pay-spin" size={16} /> : <Webhook size={16} />}
            Save webhook key
          </Button>
        </form>
      ) : null}
      {webhookKeyState.status === "success" ? (
        <p className="success-message ui-zero">{webhookKeyState.message}</p>
      ) : null}

      <div className="pay-step-actions">
        {oauthReconnectHref ? (
          <a className="ui-button ui-button-secondary" href={oauthReconnectHref}>
            <Zap size={16} />
            Reconnect with {name}
          </a>
        ) : null}
        {onReplace ? (
          <Button onClick={onReplace} type="button" variant="secondary">
            <KeyRound size={16} />
            {oauthReconnectHref ? "Paste keys instead" : "Replace credentials"}
          </Button>
        ) : null}
        <form action={recheckAction}>
          <input name="provider" type="hidden" value={provider} />
          <Button aria-busy={recheckPending} disabled={recheckPending} type="submit" variant="secondary">
            {recheckPending ? <Loader2 className="pay-spin" size={16} /> : <RefreshCw size={16} />}
            Re-check connection
          </Button>
        </form>
        <form action={disconnectAction}>
          <input name="provider" type="hidden" value={provider} />
          <Button aria-busy={disconnectPending} disabled={disconnectPending} type="submit" variant="danger">
            {disconnectPending ? <Loader2 className="pay-spin" size={16} /> : <Unplug size={16} />}
            Disconnect {name}
          </Button>
        </form>
      </div>
    </div>
  );
}
