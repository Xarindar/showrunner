"use client";

import { useActionState, useEffect } from "react";
import { CreditCard, Loader2, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui";
import {
  disconnectProviderAction,
  initialPaymentActionState,
  reverifyProviderAction,
  savePaymentMethodsAction,
  setCheckoutProviderAction
} from "../actions";

export type MethodOption = { key: string; label: string; type: string; stripePaymentMethod: string };

const featuredMethodKeys = new Set(["CASH_APP_PAY", "AFFIRM"]);

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
            <label className="module-toggle-row" key={option.key}>
              <input defaultChecked={checked} name="stripePaymentMethods" type="checkbox" value={option.key} />
              <span className="module-toggle-main">
                <span>
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
            </label>
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

export function ManageProviderModal({
  detail,
  name,
  onClose,
  provider
}: {
  detail: string;
  name: string;
  onClose: () => void;
  provider: string;
}) {
  const [recheckState, recheckAction, recheckPending] = useActionState(reverifyProviderAction, initialPaymentActionState);
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

      <div className="pay-step-actions">
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
