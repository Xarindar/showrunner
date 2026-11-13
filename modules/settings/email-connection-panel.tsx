"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useFormStatus } from "react-dom";
import { ArrowLeft, Mail } from "lucide-react";
import { Button, ButtonAnchor } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { EqualGrid } from "@/components/ui/layout";
import { Modal } from "@/components/ui/modal";
import { SettingRow } from "@/components/ui/settings";
import { disconnectEmailProviderAction, saveEmailProviderAction, sendProviderTestEmailAction } from "./email-actions";
import styles from "./email-setup.module.css";

export type EmailConnectionSummary = {
  kind: string; fromName: string; fromEmail: string; replyToEmail: string;
  smtpHost: string; smtpPort: number; smtpUser: string; connectionError: string; revision: number;
};

const providers = [
  { kind: "gmail", name: "Gmail / Google Workspace", logo: "/provider-logos/gmail.png" },
  { kind: "ionos", name: "IONOS", logo: "/provider-logos/ionos.png" },
  { kind: "smtp", name: "Other SMTP", logo: "" }
];
const stepTitles = {
  provider: "Choose your provider", security: "Check your Google account", twoFactor: "Enable 2-Step Verification",
  password: "Create and copy your app password",
  details: "Add your sending details", test: "Check it works"
};
type WizardStep = keyof typeof stepTitles;

function SubmitButton({ children, variant = "primary" }: { children: React.ReactNode; variant?: "primary" | "secondary" | "danger" }) {
  const { pending } = useFormStatus();
  return <Button type="submit" variant={variant} disabled={pending}>{pending ? "Please wait…" : children}</Button>;
}

function EmailSetupForm({ connection, businessName, contactEmail, onPendingChange }: {
  connection: EmailConnectionSummary | null; businessName: string; contactEmail: string;
  onPendingChange: (pending: boolean) => void;
}) {
  const [kind, setKind] = useState(connection?.kind || "gmail");
  const [step, setStep] = useState<WizardStep>("provider");
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [detailsVersion, setDetailsVersion] = useState(0);
  const [submitting, setSubmitting] = useState("test");
  const [values, setValues] = useState({
    fromName: "", fromEmail: "", smtpHost: "",
    smtpPort: String(connection?.smtpPort || 587), smtpUser: "", secret: ""
  });
  const [state, action, pending] = useActionState(saveEmailProviderAction, { error: "" });
  const formRef = useRef<HTMLFormElement>(null);
  const steps: WizardStep[] = kind === "gmail"
    ? ["provider", "security", ...(needsTwoFactor ? ["twoFactor" as const] : []), "password", "details", "test"]
    : ["provider", "details", "test"];
  const stepIndex = steps.indexOf(step);
  const canKeepSecret = connection?.kind === kind && (kind !== "ionos" || connection.fromEmail === values.fromEmail);
  const testPassed = Boolean(state.testToken && state.testedVersion === String(detailsVersion));
  useEffect(() => { onPendingChange(pending); }, [onPendingChange, pending]);
  useEffect(() => {
    if (step === "provider") return;
    formRef.current?.querySelector<HTMLElement>(`[data-email-step="${step}"] :is(input:not([type="hidden"]),select,button,a)`)?.focus();
  }, [step]);
  function updateField(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setValues(current => ({ ...current, [name]: value }));
    setDetailsVersion(current => current + 1);
  }
  function validateStep() {
    const controls = formRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`[data-email-step="${step}"] input, [data-email-step="${step}"] select`);
    return controls ? Array.from(controls).every(control => control.reportValidity()) : false;
  }
  function chooseProvider(nextKind: string) {
    if (nextKind !== kind) {
      setValues(current => ({ ...current, secret: "" }));
      setDetailsVersion(current => current + 1);
    }
    setKind(nextKind);
    setNeedsTwoFactor(false);
    setStep(nextKind === "gmail" ? "security" : "details");
  }
  return <form ref={formRef} action={action} className={styles.form} noValidate onSubmit={event => {
    if (pending || step === "provider" || step === "security") { event.preventDefault(); return; }
    if (step !== "test") {
      event.preventDefault();
      if (validateStep()) setStep(steps[stepIndex + 1]);
    } else if (!validateStep()) event.preventDefault();
    else setSubmitting(((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value || "test");
  }}>
    <input type="hidden" name="revision" value={connection?.revision || 0} />
    <input type="hidden" name="kind" value={kind} />
    <input type="hidden" name="detailsVersion" value={detailsVersion} />
    <input type="hidden" name="testToken" value={state.testToken || ""} />
    <div className={styles.stepHeader}>
      {stepIndex > 0 ? <Button type="button" variant="ghost" size="sm" onClick={() => setStep(steps[stepIndex - 1])} disabled={pending}><ArrowLeft size={16} aria-hidden="true" />Back</Button> : null}
      <p className={styles.progress} aria-live="polite">Step {stepIndex + 1} of {steps.length}</p>
    </div>
    <h3 className="compact-title">{stepTitles[step]}</h3>
    <fieldset className={styles.step} data-email-step="provider" hidden={step !== "provider"} aria-label={stepTitles.provider}>
      <div className={styles.providers}>
        {providers.map(provider => <Button key={provider.kind} type="button" className={styles.provider}
          variant="secondary"
          onClick={event => { event.preventDefault(); chooseProvider(provider.kind); }}>
          <span className={styles.providerIcon}>
            {provider.logo
              // Brand PNGs are checked-in assets; no remote image request or optimizer is needed.
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={provider.logo} className={provider.kind === "ionos" ? styles.wordmark : undefined} alt="" width={provider.kind === "ionos" ? 80 : 40} height={40} />
              : <Mail size={24} aria-hidden="true" />}
          </span>
          {provider.name}
        </Button>)}
      </div>
      <p>Choose the account or service you want Showrunner to send customer emails through.</p>
    </fieldset>
    <fieldset className={styles.step} data-email-step="security" hidden={step !== "security"} aria-label={stepTitles.security}>
      <p>Do you already have two-factor authentication enabled on your Google account? Google calls this 2-Step Verification.</p>
    </fieldset>
    <fieldset className={styles.step} data-email-step="twoFactor" hidden={step !== "twoFactor"} aria-label={stepTitles.twoFactor}>
      <p>Google requires 2-Step Verification before you can create an app password.</p>
      <ol className={styles.instructions}>
        <li>Open Google’s security settings and sign in to the account you want to send emails from.</li>
        <li>Follow Google’s prompts to turn on 2-Step Verification and complete the verification.</li>
        <li>When Google confirms it is on, return to this window to continue.</li>
      </ol>
      <ButtonAnchor href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noopener noreferrer" variant="secondary">Set up 2-Step Verification</ButtonAnchor>
    </fieldset>
    <fieldset className={styles.step} data-email-step="password" hidden={step !== "password"} aria-label={stepTitles.password}>
      <ol className={styles.instructions}>
        <li>Open Google’s App passwords page for the account you want to connect.</li>
        <li>Create a new app password named <strong>Showrunner</strong>.</li>
        <li><strong>Copy the entire 16-character app password before closing Google’s window.</strong> Google only shows it once.</li>
        <li>Return here and paste it below. Use the app password, not your regular Google password.</li>
      </ol>
      <ButtonAnchor href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" variant="secondary">Open app passwords</ButtonAnchor>
      {kind === "gmail" ? <Field label="App password" hint="Paste the password you copied from Google. Spaces are accepted.">
        <Input name="secret" type="password" value={values.secret} placeholder="Paste your app password" onChange={updateField} required pattern=".*\S.*" autoComplete="new-password" maxLength={4096} />
      </Field> : null}
      <p>If Google does not offer app passwords, your account policies may not allow them. <a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer">Check Google’s help</a> or go Back and choose another provider.</p>
    </fieldset>
    <fieldset className={styles.step} data-email-step="details" hidden={step !== "details"} aria-label={stepTitles.details}>
      {kind === "ionos" ? <>
        <p>Enter your IONOS Mail Basic or Mail Business address and mailbox password. We fill in the secure sending settings for you.</p>
        <ButtonAnchor href="https://mail.ionos.com/" target="_blank" rel="noopener noreferrer" variant="secondary">Check your login in IONOS Webmail</ButtonAnchor>
      </> : null}
      {kind === "smtp" ? <p>Copy the outgoing SMTP settings from your email provider. The connection must support TLS.</p> : null}
      <EqualGrid>
        <Field label="Sender name"><Input name="fromName" value={values.fromName} placeholder={connection?.fromName || businessName} onChange={updateField} maxLength={120} required autoComplete="organization" /></Field>
        <Field label="Sender email" hint={kind === "gmail" ? "Use the Google account where you created the app password." : undefined}><Input name="fromEmail" type="email" value={values.fromEmail} placeholder={connection?.fromEmail || contactEmail || "you@example.com"} onChange={updateField} required autoComplete="email" /></Field>
      </EqualGrid>
      {kind === "smtp" ? <>
        <EqualGrid>
          <Field label="SMTP hostname"><Input name="smtpHost" value={values.smtpHost} onChange={updateField} placeholder={connection?.smtpHost || "smtp.your-provider.com"} required autoCapitalize="none" spellCheck={false} /></Field>
          <Field label="Port"><Select name="smtpPort" value={values.smtpPort} onChange={updateField}>
            <option value="587">587 — STARTTLS</option><option value="465">465 — TLS</option><option value="2525">2525 — STARTTLS</option>
          </Select></Field>
        </EqualGrid>
        <Field label="SMTP username"><Input name="smtpUser" value={values.smtpUser} placeholder={connection?.smtpUser || "Your SMTP username"} onChange={updateField} required autoComplete="username" /></Field>
      </> : <><input type="hidden" name="smtpHost" value="" /><input type="hidden" name="smtpPort" value="587" /><input type="hidden" name="smtpUser" value="" /></>}
      {kind !== "gmail" ? <Field label={kind === "ionos" ? "Mailbox password" : "SMTP password"}
        hint={canKeepSecret ? "Leave blank to keep the saved credential. A different mailbox needs a new password." : kind === "ionos" ? "Use this mailbox’s email password, not your IONOS customer account password." : "Saved securely in your own Showrunner deployment."}>
        <Input name="secret" type="password" value={values.secret} placeholder={kind === "ionos" ? "Enter your mailbox password" : "Enter your SMTP password"} onChange={updateField} required={!canKeepSecret} autoComplete="new-password" maxLength={4096} />
      </Field> : null}
    </fieldset>
    <fieldset className={styles.step} data-email-step="test" hidden={step !== "test"} aria-label={stepTitles.test}>
      <p>Send a test email to <strong>{values.fromEmail}</strong>. Customer replies will go to this address too.</p>
      <Button type="submit" name="intent" value="test" variant="secondary" disabled={pending}>{pending && submitting === "test" ? "Sending test…" : "Send test email"}</Button>
      {testPassed ? <p role="status">Test email sent. Check your inbox, then choose Done to save this connection.</p> : null}
      {connection ? <p>Your current connection keeps working until this test succeeds.</p> : null}
    </fieldset>
    {state.error && step === "test" ? <p className={styles.error} role="alert">{state.error}</p> : null}
    {step !== "provider" ? <div className="module-modal-actions">
      {step === "security" ? <>
        <Button type="button" variant="secondary" onClick={event => { event.preventDefault(); setNeedsTwoFactor(true); setStep("twoFactor"); }}>No</Button>
        <Button type="button" onClick={event => { event.preventDefault(); setNeedsTwoFactor(false); setStep("password"); }}>Yes</Button>
      </> : <Button type="submit" name={step === "test" ? "intent" : undefined} value={step === "test" ? "save" : undefined}
        disabled={pending || (step === "password" && !values.secret.trim()) || (step === "test" && !testPassed)}>
        {pending && submitting === "save" ? "Saving…" : step === "test" ? "Done" : step === "twoFactor" ? "I’ve enabled 2-Step Verification" : "Next"}
      </Button>}
    </div> : null}
  </form>;
}

export function EmailConnectionPanel({ connection, businessName, contactEmail }: {
  connection: EmailConnectionSummary | null; businessName: string; contactEmail: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const closeSetup = () => { if (!saving) setEditing(false); };
  const providerName = providers.find(provider => provider.kind === connection?.kind)?.name;
  return <section aria-label="Email connection" className="ui-settings-category-body">
    <SettingRow title={connection?.fromEmail || "Connect your email"} description={connection ? <>
      <span className={connection.connectionError ? "ui-badge ui-badge-danger" : "ui-badge ui-badge-success"}>{connection.connectionError ? "Needs attention" : `Connected · ${providerName}`}</span><br />
      {connection.connectionError || `Replies go to ${connection.fromEmail}.`}
    </> : "Set up your provider with step-by-step help."}>
      <Button onClick={() => setEditing(true)} variant={connection ? "secondary" : "primary"}>{connection ? "Change provider or email" : "Set up email"}</Button>
    </SettingRow>
    {connection ? <>
      <SettingRow title="Check delivery" description={`Send a test email to ${connection.fromEmail}.`}>
        <form action={sendProviderTestEmailAction}><SubmitButton variant="secondary">Send test email</SubmitButton></form>
      </SettingRow>
      <SettingRow title="Disconnect provider" description="Remove the saved credential from this Showrunner deployment.">
        <Button variant="secondary" onClick={() => setDisconnecting(true)}>Disconnect</Button>
      </SettingRow>
    </> : null}
    <Modal open={editing} onClose={closeSetup} title={connection ? "Change email connection" : "Set up email"} className={styles.dialog}>
      {editing ? <EmailSetupForm connection={connection} businessName={businessName} contactEmail={contactEmail} onPendingChange={setSaving} /> : null}
    </Modal>
    <Modal open={disconnecting} onClose={() => setDisconnecting(false)} title="Disconnect email provider?">
      <p>Messages waiting for this connection will need review in Communications. New messages can only send if another delivery setup is configured for this deployment.</p>
      <form action={disconnectEmailProviderAction} className="module-modal-actions">
        <input type="hidden" name="revision" value={connection?.revision || 0} />
        <Button type="button" variant="secondary" onClick={() => setDisconnecting(false)}>Cancel</Button>
        <SubmitButton variant="danger">Disconnect provider</SubmitButton>
      </form>
    </Modal>
  </section>;
}
