"use client";

import { useActionState, useId, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Notification } from "@/components/ui/notifications";
import { connectPayPalAction, connectStripeAction, connectSquareAction, inspectSquareLocationsAction } from "../actions";
import { initialPaymentActionState, type PaymentActionState, type SquareLocationState } from "../state";

type WizardField = {
  name: string; label: string; placeholder?: string; hint?: string;
  secret?: boolean; options?: { value: string; label: string }[]; pattern?: RegExp;
};
type WizardStep = {
  title: string; lead: string; instructions?: string[]; link?: { href: string; label: string };
} & ({ kind: "intro" | "review" | "locations" } | { kind: "field"; field: WizardField });
export type WizardConfig = {
  provider: "STRIPE" | "SQUARE" | "PAYPAL"; name: string; steps: WizardStep[];
  action: (state: PaymentActionState, formData: FormData) => Promise<PaymentActionState>;
};

export function buildConnectWizards(): Record<WizardConfig["provider"], WizardConfig> {
  const squareLink = { href: "https://developer.squareup.com/apps", label: "Open Square Developer" };
  const paypalLink = { href: "https://developer.paypal.com/dashboard/applications", label: "Open PayPal apps" };
  const environment = (name: string, live: string): WizardStep => ({ kind: "field", title: "Choose live payments or testing",
    lead: "Choose Live to accept real payments. Sandbox is for testing with your processor's test account.",
    field: { name, label: "Payment environment", options: [{ value: live, label: "Live payments" }, { value: "sandbox", label: "Sandbox (testing)" }] } });
  return {
    STRIPE: { provider: "STRIPE", name: "Stripe", action: connectStripeAction, steps: [
      { kind: "intro", title: "Start with your Stripe account", lead: "Use an account owned by your business. If you already have one, sign in and continue here.",
        instructions: ["Create a Stripe account if you need one, then finish its business and payout setup.", "Keep Stripe open in the new tab. Return here when your account is ready."],
        link: { href: "https://dashboard.stripe.com/register", label: "Open Stripe" } },
      { kind: "field", title: "Copy your Stripe secret key", lead: "Open API keys in Stripe. Reveal or create a key, copy it, and paste it below.",
        instructions: ["Use a live key for real payments or a test key for testing.", "For a restricted key, allow the checkout, payments, refunds, account-read and webhook permissions Showrunner needs."],
        link: { href: "https://dashboard.stripe.com/apikeys", label: "Open Stripe API keys" },
        field: { name: "stripeApiKey", label: "Stripe secret key", secret: true, placeholder: "sk_live_…", pattern: /^(sk|rk)_(test|live)_/,
          hint: "Use sk_live_, sk_test_, rk_live_ or rk_test_. Copy the entire key; Stripe may only show it once." } },
      { kind: "review", title: "Connect your Stripe account", lead: "Showrunner will verify your key and set up payment notifications directly with Stripe. No charge will be made." }
    ] },
    SQUARE: { provider: "SQUARE", name: "Square", action: connectSquareAction, steps: [
      { kind: "intro", title: "Start with your Square account", lead: "Sign in to Square Developer with the Square account that should receive your payments.",
        instructions: ["Choose Create an application if you do not already have one for this Showrunner. Name it Showrunner.", "This application belongs to you. Keep its page open and return here."], link: squareLink },
      environment("squareEnvironment", "production"),
      { kind: "field", title: "Copy your Square access token", lead: "Open your application's Credentials page and select the same environment you chose here.",
        instructions: ["Copy the personal access token from Production or the Sandbox access token from Sandbox.", "Paste the full token below. Use your own application's token, rather than an OAuth token from another app."], link: squareLink,
        field: { name: "squareAccessToken", label: "Square access token", secret: true, placeholder: "Paste your access token" } },
      { kind: "locations", title: "Choose your Square location", lead: "Check your token to load the active locations from your Square account. Choose the location that should own this site's payments." },
      { kind: "review", title: "Connect your Square account", lead: "Showrunner will verify the token and location. It checks payment and refund updates automatically, usually within a minute. No charge will be made." }
    ] },
    PAYPAL: { provider: "PAYPAL", name: "PayPal", action: connectPayPalAction, steps: [
      { kind: "intro", title: "Start with your PayPal Business account", lead: "Sign in to PayPal Developer using the business account that should receive your payments.",
        instructions: ["Open Apps & Credentials. Create a REST app named Showrunner if you need one.", "Keep the app open in the new tab, then return here."], link: paypalLink },
      environment("paypalEnvironment", "live"),
      { kind: "field", title: "Copy your PayPal client ID", lead: "Open your Showrunner REST app in the environment you chose. Copy its Client ID and paste it here.", link: paypalLink,
        field: { name: "paypalClientId", label: "PayPal client ID", placeholder: "Paste your client ID" } },
      { kind: "field", title: "Copy your PayPal secret", lead: "On the same app page, reveal the Secret. Copy the full value and paste it below.", link: paypalLink,
        field: { name: "paypalClientSecret", label: "PayPal secret", secret: true, placeholder: "Paste your secret", hint: "Use the secret from the same app and environment as your client ID." } },
      { kind: "review", title: "Connect your PayPal account", lead: "Showrunner will verify your credentials and set up payment notifications directly with PayPal. No charge will be made." }
    ] }
  };
}

export function ConnectWizard({ config, defaultUseForCheckout, onClose, open }: {
  config: WizardConfig; defaultUseForCheckout: boolean; onClose: () => void; open: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const [state, formAction, pending] = useActionState(config.action, initialPaymentActionState);
  const [locationState, locationAction, checking] = useActionState<SquareLocationState, FormData>(inspectSquareLocationsAction, initialPaymentActionState);
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({ squareEnvironment: "production", paypalEnvironment: "live" });
  const [inspectionVersion, setInspectionVersion] = useState(0);
  const locations = locationState.inspectionVersion === String(inspectionVersion) ? locationState.locations : undefined;
  const [useForCheckout, setUseForCheckout] = useState(defaultUseForCheckout);
  const step = config.steps[stepIndex];
  const fields = config.steps.flatMap((item) => item.kind === "field" ? [item.field] : []);
  const validField = step.kind !== "field" || Boolean(values[step.field.name]?.trim() && (!step.field.pattern || step.field.pattern.test(values[step.field.name].trim())));
  const locationId = values.squareLocationId || (locations?.length === 1 ? locations[0].id : "");
  const busy = pending || checking;
  function close() { if (!busy) { router.refresh(); onClose(); } }
  function update(name: string, value: string) { setInspectionVersion((current) => current + 1); setValues((current) => ({ ...current, [name]: value, squareLocationId: "" })); }
  return (
    <Modal className="pay-dialog" onClose={close} open={open} title={`Set up ${config.name}`}>
      {state.status === "success" ? (
        <div className="pay-wizard">
          <h3 className="ui-zero">{config.name} is connected</h3>
          <p className="pay-step-lead">Your credentials are stored encrypted in this deployment. You can replace them or disconnect from Payments at any time.</p>
          <p className="pay-step-lead">{useForCheckout ? "This account is selected for new checkouts. " : "Your checkout account choice has not changed. "}No test payment was charged. Complete a sandbox checkout before relying on a new connection.</p>
          <div className="module-modal-actions"><Button onClick={close} type="button">Done</Button></div>
        </div>
      ) : (
        <div className="pay-wizard">
          <div className="pay-wizard-progress">
            {stepIndex > 0 ? <Button disabled={busy} onClick={() => setStepIndex(stepIndex - 1)} type="button" variant="ghost"><ArrowLeft size={16} />Back</Button> : null}
            <p aria-live="polite" className="pay-progress-count">Step {stepIndex + 1} of {config.steps.length}</p>
          </div>
          <div className="pay-step" key={stepIndex}>
            <h3 className="ui-zero">{step.title}</h3>
            <p className="pay-step-lead">{step.lead}</p>
            {step.instructions ? <ol className="pay-instructions">{step.instructions.map((item) => <li key={item}>{item}</li>)}</ol> : null}
            {step.link ? <a className="ui-button ui-button-secondary" href={step.link.href} rel="noreferrer" target="_blank">{step.link.label}<ExternalLink size={15} /><span className="ui-sr-only"> (opens a new tab)</span></a> : null}
            {step.kind === "field" ? <Field hint={step.field.hint} label={step.field.label}>
              {step.field.options ? <Select aria-label={step.field.label} onChange={(event) => update(step.field.name, event.target.value)} value={values[step.field.name] ?? ""}>
                {step.field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select> : <Input aria-label={step.field.label} autoComplete="off" name={step.field.name} onChange={(event) => update(step.field.name, event.target.value)} placeholder={step.field.placeholder}
                spellCheck={false} type={step.field.secret ? "password" : "text"} value={values[step.field.name] ?? ""} />}
            </Field> : null}
            {step.kind === "locations" ? <form action={locationAction} className="pay-step">
              <input name="inspectionVersion" type="hidden" value={inspectionVersion} />
              <input name="squareEnvironment" type="hidden" value={values.squareEnvironment} />
              <input name="squareAccessToken" type="hidden" value={values.squareAccessToken || ""} />
              <Button aria-busy={checking} disabled={checking} type="submit" variant="secondary">{checking ? "Checking…" : "Check token and load locations"}</Button>
              {locationState.status === "error" ? <Notification tone="danger" eventKey={locationState}>{locationState.message}</Notification> : null}
              {locationState.status === "success" && locations ? <Field label="Square location"><Select aria-label="Square location" name="squareLocationId" onChange={(event) => setValues((current) => ({ ...current, squareLocationId: event.target.value }))} value={locationId}>
                <option disabled value="">Choose a location</option>
                {locations?.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </Select></Field> : null}
            </form> : null}
            {step.kind === "review" ? <form action={formAction} className="pay-review" id={formId}>
              <dl className="pay-review-list">{fields.map((field) => <div key={field.name}><dt>{field.label}</dt><dd>{field.secret ? "Entered" : field.options?.find((item) => item.value === values[field.name])?.label || values[field.name]}</dd></div>)}
                {config.provider === "SQUARE" ? <div><dt>Square location</dt><dd>{locations?.find((item) => item.id === locationId)?.name}</dd></div> : null}
              </dl>
              {fields.map((field) => <input key={field.name} name={field.name} type="hidden" value={values[field.name] || ""} />)}
              <input name="squareLocationId" type="hidden" value={locationId} />
              <label className="ui-checkbox-row"><input checked={useForCheckout} name="useForCheckout" onChange={(event) => setUseForCheckout(event.target.checked)} type="checkbox" />Use this account for new checkouts</label>
              <p className="pay-secure-note"><ShieldCheck size={16} />Verified with {config.name}, then stored encrypted.</p>
              <p className="pay-step-lead">A failed check keeps your saved connection. Replacing an account can prevent refunds for earlier payments. Finish outstanding payments and refunds before switching accounts.</p>
              {state.status === "error" ? <Notification tone="danger" eventKey={state}>{state.message}</Notification> : null}
            </form> : null}
          </div>
          <div className="module-modal-actions">
            {step.kind === "review" ? <Button key="connect" aria-busy={pending} disabled={pending} form={formId} type="submit">{pending ? <Loader2 className="pay-spin" size={16} /> : null}{pending ? "Connecting…" : `Connect ${config.name}`}</Button>
              : <Button key="next" disabled={busy || !validField || (step.kind === "locations" && !locationId)} onClick={() => setStepIndex(stepIndex + 1)} type="button">Next</Button>}
          </div>
        </div>
      )}
    </Modal>
  );
}
