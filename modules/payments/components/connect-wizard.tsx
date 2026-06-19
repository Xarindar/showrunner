"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  ShieldCheck,
  X
} from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui";
import {
  connectPayPalAction,
  connectStripeAction,
  connectSquareAction,
  initialPaymentActionState,
  type PaymentActionState
} from "../actions";

// ---------------------------------------------------------------------------
// Shared modal + small building blocks (also reused by the manage modals)
// ---------------------------------------------------------------------------

export function Modal({
  children,
  onClose,
  open,
  title
}: {
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  return (
    <dialog
      className="ui-dialog pay-dialog"
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      ref={ref}>
      <div className="pay-dialog-head">
        <h2 className="ui-zero">{title}</h2>
        <Button aria-label="Close" onClick={onClose} size="sm" type="button" variant="ghost">
          <X size={16} />
        </Button>
      </div>
      <div className="ui-dialog-body">{open ? children : null}</div>
    </dialog>
  );
}

export function LinkOutButton({ children, href }: { children: ReactNode; href: string }) {
  return (
    <a className="ui-button ui-button-secondary pay-linkout" href={href} rel="noreferrer" target="_blank">
      {children}
      <ExternalLink size={15} />
      <span className="pay-linkout-tab">opens a new tab</span>
    </a>
  );
}

export function CopyValue({ hint, label, value }: { hint?: string; label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="pay-copy">
      <span className="pay-copy-label">{label}</span>
      <div className="pay-copy-row">
        <code>{value}</code>
        <Button onClick={copy} size="sm" type="button" variant="secondary">
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {hint ? <small className="pay-copy-hint">{hint}</small> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wizard step model
// ---------------------------------------------------------------------------

type WizardLink = { href: string; label: string };
type WizardCopy = { label: string; value: string; hint?: string };

type WizardField = {
  name: string;
  label: string;
  kind: "text" | "password" | "select";
  hint?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  optional?: boolean;
  secret?: boolean;
  defaultValue?: string;
  pattern?: RegExp;
  patternError?: string;
};

type WizardStep =
  | { kind: "intro"; title: string; lead: string; points: string[]; link?: WizardLink }
  | {
      kind: "field";
      title: string;
      lead: string;
      link?: WizardLink;
      copy?: WizardCopy;
      events?: string[];
      field: WizardField;
    }
  | { kind: "review"; title: string; lead: string; submitLabel: string; successTitle: string; successBody: string };

export type WizardConfig = {
  provider: "STRIPE" | "SQUARE" | "PAYPAL";
  name: string;
  intro: string;
  steps: WizardStep[];
  action: (state: PaymentActionState, formData: FormData) => Promise<PaymentActionState>;
};

// ---------------------------------------------------------------------------
// Wizard configs — webhook URLs are injected from the server (per-deployment).
// ---------------------------------------------------------------------------

export type WebhookUrls = { stripe: string; square: string; paypal: string };

export function buildConnectWizards(webhooks: WebhookUrls): Record<WizardConfig["provider"], WizardConfig> {
  return {
    STRIPE: {
      provider: "STRIPE",
      name: "Stripe",
      intro: "Cards, Apple Pay, Google Pay, Cash App Pay, and Affirm — all from one connection. Takes about 3 minutes.",
      action: connectStripeAction,
      steps: [
        {
          kind: "intro",
          title: "Before you start",
          lead: "You'll copy two things out of your Stripe dashboard and paste them back here. We verify them live before saving — nothing is stored until Stripe accepts it.",
          points: [
            "A Stripe account that has finished activation (charges enabled).",
            "Your Secret key — copied from the Stripe dashboard.",
            "A webhook signing secret — created in two clicks, walked through below.",
            "Cash App Pay and Affirm are included; you turn them on after connecting."
          ],
          link: { href: "https://dashboard.stripe.com", label: "Open Stripe" }
        },
        {
          kind: "field",
          title: "Step 1 — copy your Secret key",
          lead: "Open the Stripe API keys page in a new tab. Reveal and copy your Secret key, then paste it below.",
          link: { href: "https://dashboard.stripe.com/apikeys", label: "Open Stripe API keys" },
          field: {
            name: "stripeApiKey",
            label: "Stripe secret key",
            kind: "password",
            secret: true,
            placeholder: "sk_live_…",
            hint: "Starts with sk_live_ or sk_test_ (a restricted rk_ key works too).",
            pattern: /^(sk|rk)_(test|live)_/,
            patternError: "That should start with sk_live_, sk_test_, rk_live_, or rk_test_."
          }
        },
        {
          kind: "field",
          title: "Step 2 — add a webhook",
          lead: "In Stripe, go to Developers → Webhooks → Add endpoint. Paste the endpoint URL below, select the events listed, then copy the Signing secret Stripe shows you.",
          link: { href: "https://dashboard.stripe.com/webhooks", label: "Open Stripe webhooks" },
          copy: {
            label: "Endpoint URL — paste this into Stripe",
            value: webhooks.stripe,
            hint: "Stripe calls this address when a payment succeeds, fails, or is refunded."
          },
          events: [
            "checkout.session.completed",
            "checkout.session.async_payment_succeeded",
            "checkout.session.expired",
            "payment_intent.payment_failed",
            "charge.refunded"
          ],
          field: {
            name: "stripeWebhookSecret",
            label: "Webhook signing secret",
            kind: "password",
            secret: true,
            placeholder: "whsec_…",
            hint: "Shown right after you create the endpoint. Starts with whsec_.",
            pattern: /^whsec_/,
            patternError: "The signing secret should start with whsec_."
          }
        },
        {
          kind: "review",
          title: "Connect Stripe",
          lead: "We'll verify these with Stripe and store them encrypted. You can replace them any time.",
          submitLabel: "Connect & verify Stripe",
          successTitle: "Stripe is connected",
          successBody: "Cash App Pay and Affirm are now available to switch on under \"Ways customers pay.\""
        }
      ]
    },
    SQUARE: {
      provider: "SQUARE",
      name: "Square",
      intro: "Square-hosted checkout with cards, Apple Pay, Google Pay, and Cash App Pay, settled to your own Square account.",
      action: connectSquareAction,
      steps: [
        {
          kind: "intro",
          title: "Before you start",
          lead: "You'll copy an access token and a webhook signature key out of the Square Developer dashboard. We verify them live before saving.",
          points: [
            "A Square account and an application in the Square Developer dashboard.",
            "The access token for the environment you want to use.",
            "A webhook signature key — created below.",
            "Match the token's environment (Production vs Sandbox)."
          ],
          link: { href: "https://developer.squareup.com/apps", label: "Open Square Developer" }
        },
        {
          kind: "field",
          title: "Step 1 — choose the environment",
          lead: "Pick the environment your access token belongs to. Use Production for real payments.",
          field: {
            name: "squareEnvironment",
            label: "Environment",
            kind: "select",
            defaultValue: "production",
            options: [
              { value: "production", label: "Production (real payments)" },
              { value: "sandbox", label: "Sandbox (testing)" }
            ]
          }
        },
        {
          kind: "field",
          title: "Step 2 — copy your access token",
          lead: "Open your application in the Square Developer dashboard, then copy the access token for the environment you chose.",
          link: { href: "https://developer.squareup.com/apps", label: "Open Square Developer" },
          field: {
            name: "squareAccessToken",
            label: "Access token",
            kind: "password",
            secret: true,
            placeholder: "EAAA…",
            hint: "Found under your application's Credentials, matching the environment above."
          }
        },
        {
          kind: "field",
          title: "Step 3 — add a webhook",
          lead: "In Square's Developer dashboard, add a webhook subscription pointing at the URL below for the listed events, then copy its Signature key.",
          link: { href: "https://developer.squareup.com/apps", label: "Open Square webhooks" },
          copy: {
            label: "Notification URL — paste this into Square",
            value: webhooks.square,
            hint: "Square calls this address when a payment or refund updates."
          },
          events: ["payment.updated", "refund.updated"],
          field: {
            name: "squareWebhookSignatureKey",
            label: "Webhook signature key",
            kind: "password",
            secret: true,
            hint: "Shown when you create the webhook subscription."
          }
        },
        {
          kind: "field",
          title: "Step 4 — location (optional)",
          lead: "Leave this blank and we'll use your first active location automatically. Only fill it in if you want a specific location.",
          field: {
            name: "squareLocationId",
            label: "Location ID",
            kind: "text",
            optional: true,
            placeholder: "L… (optional)",
            hint: "Optional — blank uses your first active Square location."
          }
        },
        {
          kind: "review",
          title: "Connect Square",
          lead: "We'll verify these with Square and store them encrypted.",
          submitLabel: "Connect & verify Square",
          successTitle: "Square is connected",
          successBody: "You can now make Square the account that runs checkout."
        }
      ]
    },
    PAYPAL: {
      provider: "PAYPAL",
      name: "PayPal",
      intro: "PayPal checkout settled to your own PayPal business account.",
      action: connectPayPalAction,
      steps: [
        {
          kind: "intro",
          title: "Before you start",
          lead: "You'll copy a Client ID, Secret, and Webhook ID out of the PayPal Developer dashboard. We verify them live before saving.",
          points: [
            "A PayPal business account.",
            "A REST app in the PayPal Developer dashboard.",
            "The app's Client ID and Secret.",
            "A webhook ID — created below."
          ],
          link: { href: "https://developer.paypal.com/dashboard/applications", label: "Open PayPal Developer" }
        },
        {
          kind: "field",
          title: "Step 1 — choose the environment",
          lead: "Use Live for real payments, or Sandbox for testing. Your app credentials must match.",
          field: {
            name: "paypalEnvironment",
            label: "Environment",
            kind: "select",
            defaultValue: "live",
            options: [
              { value: "live", label: "Live (real payments)" },
              { value: "sandbox", label: "Sandbox (testing)" }
            ]
          }
        },
        {
          kind: "field",
          title: "Step 2 — copy your Client ID",
          lead: "Open (or create) a REST app in the PayPal Developer dashboard and copy its Client ID.",
          link: { href: "https://developer.paypal.com/dashboard/applications", label: "Open PayPal apps" },
          field: {
            name: "paypalClientId",
            label: "Client ID",
            kind: "text",
            placeholder: "A…",
            hint: "From your PayPal REST app's API credentials."
          }
        },
        {
          kind: "field",
          title: "Step 3 — copy your Secret",
          lead: "On the same PayPal app screen, reveal and copy the Secret.",
          link: { href: "https://developer.paypal.com/dashboard/applications", label: "Open PayPal apps" },
          field: {
            name: "paypalClientSecret",
            label: "Secret",
            kind: "password",
            secret: true,
            hint: "From the same REST app — click Show under Secret."
          }
        },
        {
          kind: "field",
          title: "Step 4 — add a webhook",
          lead: "In your PayPal app, add a webhook pointing at the URL below for the listed events, then copy its Webhook ID.",
          link: { href: "https://developer.paypal.com/dashboard/applications", label: "Open PayPal apps" },
          copy: {
            label: "Webhook URL — paste this into PayPal",
            value: webhooks.paypal,
            hint: "PayPal calls this address when an order is approved or a capture changes."
          },
          events: [
            "CHECKOUT.ORDER.APPROVED",
            "PAYMENT.CAPTURE.COMPLETED",
            "PAYMENT.CAPTURE.DENIED",
            "PAYMENT.CAPTURE.REFUNDED"
          ],
          field: {
            name: "paypalWebhookId",
            label: "Webhook ID",
            kind: "text",
            placeholder: "WH-…",
            hint: "Shown on the webhook you just created."
          }
        },
        {
          kind: "review",
          title: "Connect PayPal",
          lead: "We'll verify these with PayPal and store them encrypted.",
          submitLabel: "Connect & verify PayPal",
          successTitle: "PayPal is connected",
          successBody: "You can now make PayPal the account that runs checkout."
        }
      ]
    }
  };
}

// ---------------------------------------------------------------------------
// The guided wizard
// ---------------------------------------------------------------------------

function fieldSteps(steps: WizardStep[]): WizardField[] {
  return steps.flatMap((step) => (step.kind === "field" ? [step.field] : []));
}

function maskValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}

export function ConnectWizard({ config, onClose }: { config: WizardConfig; onClose: () => void }) {
  const [state, formAction, pending] = useActionState(config.action, initialPaymentActionState);
  const [stepIndex, setStepIndex] = useState(0);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fieldSteps(config.steps)) initial[field.name] = field.defaultValue ?? "";
    return initial;
  });

  const step = config.steps[stepIndex];
  const stepCount = config.steps.length;
  const isLast = stepIndex === stepCount - 1;
  const connected = state.status === "success";

  function setValue(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    if (fieldError) setFieldError(null);
  }

  function goNext() {
    if (step.kind === "field") {
      const { field } = step;
      const value = (values[field.name] ?? "").trim();
      if (!field.optional && !value) {
        setFieldError(`${field.label} is required to continue.`);
        return;
      }
      if (value && field.pattern && !field.pattern.test(value)) {
        setFieldError(field.patternError || `That does not look like a valid ${field.label.toLowerCase()}.`);
        return;
      }
    }
    setFieldError(null);
    setStepIndex((index) => Math.min(index + 1, stepCount - 1));
  }

  function goBack() {
    setFieldError(null);
    setStepIndex((index) => Math.max(index - 1, 0));
  }

  if (connected && isLast && step.kind === "review") {
    return (
      <div className="pay-wizard pay-wizard-success">
        <div className="pay-success-mark">
          <CheckCircle2 size={42} />
        </div>
        <h3 className="ui-zero">{step.successTitle}</h3>
        <p className="pay-step-lead">{step.successBody}</p>
        <Button onClick={onClose} type="button">
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="pay-wizard">
      <ol className="pay-progress" aria-label={`Step ${stepIndex + 1} of ${stepCount}`}>
        {config.steps.map((item, index) => (
          <li
            className={index < stepIndex ? "pay-progress-dot done" : index === stepIndex ? "pay-progress-dot current" : "pay-progress-dot"}
            key={item.title}>
            {index < stepIndex ? <Check size={12} /> : index + 1}
          </li>
        ))}
      </ol>
      <p className="pay-progress-count">
        Step {stepIndex + 1} of {stepCount}
      </p>

      <div className="pay-step">
        <h3 className="ui-zero">{step.title}</h3>
        <p className="pay-step-lead">{step.lead}</p>

        {step.kind === "intro" ? (
          <>
            <ul className="pay-checklist">
              {step.points.map((point) => (
                <li key={point}>
                  <Check size={15} />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            {step.link ? <LinkOutButton href={step.link.href}>{step.link.label}</LinkOutButton> : null}
          </>
        ) : null}

        {step.kind === "field" ? (
          <>
            {step.link ? <LinkOutButton href={step.link.href}>{step.link.label}</LinkOutButton> : null}
            {step.copy ? <CopyValue hint={step.copy.hint} label={step.copy.label} value={step.copy.value} /> : null}
            {step.events ? (
              <div className="pay-events">
                <span className="pay-copy-label">Select these events</span>
                <div className="pay-event-list">
                  {step.events.map((event) => (
                    <code key={event}>{event}</code>
                  ))}
                </div>
              </div>
            ) : null}
            <Field hint={step.field.hint} label={step.field.label}>
              {step.field.kind === "select" ? (
                <Select
                  name={step.field.name}
                  onChange={(event) => setValue(step.field.name, event.target.value)}
                  value={values[step.field.name] ?? ""}>
                  {step.field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  autoComplete="off"
                  name={step.field.name}
                  onChange={(event) => setValue(step.field.name, event.target.value)}
                  placeholder={step.field.placeholder}
                  type={step.field.kind === "password" ? "password" : "text"}
                  value={values[step.field.name] ?? ""} />
              )}
            </Field>
            {fieldError ? <p className="error ui-zero">{fieldError}</p> : null}
          </>
        ) : null}

        {step.kind === "review" ? (
          <form action={formAction} className="pay-review">
            <dl className="pay-review-list">
              {fieldSteps(config.steps).map((field) => {
                const raw = (values[field.name] ?? "").trim();
                const display = field.secret
                  ? maskValue(raw)
                  : field.kind === "select"
                    ? field.options?.find((option) => option.value === raw)?.label || raw
                    : raw || (field.optional ? "Auto (first active location)" : "");
                return (
                  <div key={field.name}>
                    <dt>{field.label}</dt>
                    <dd>{display || "—"}</dd>
                  </div>
                );
              })}
            </dl>
            {fieldSteps(config.steps).map((field) => (
              <input key={field.name} name={field.name} type="hidden" value={values[field.name] ?? ""} />
            ))}
            {state.status === "error" ? <p className="error ui-zero">{state.message}</p> : null}
            <p className="pay-secure-note">
              <ShieldCheck size={14} /> Verified live with {config.name}, then stored encrypted.
            </p>
            <Button aria-busy={pending} disabled={pending} type="submit">
              {pending ? <Loader2 className="pay-spin" size={18} /> : <ShieldCheck size={18} />}
              {pending ? `Verifying with ${config.name}…` : step.submitLabel}
            </Button>
          </form>
        ) : null}
      </div>

      {step.kind !== "review" || !connected ? (
        <div className="pay-step-actions">
          <Button disabled={stepIndex === 0} onClick={goBack} type="button" variant="secondary">
            <ChevronLeft size={16} />
            Back
          </Button>
          {step.kind !== "review" ? (
            <Button onClick={goNext} type="button">
              Continue
              <ChevronRight size={16} />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
