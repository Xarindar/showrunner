"use client";

import { TimeInput } from "@/components/ui/time-input";
import { Notification } from "@/components/ui/notifications";

import { useActionState, useState, type ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { createServiceAction } from "../actions";
import styles from "@/modules/appointments/session-form.module.css";
import { ServiceTagsField } from "./service-tags-field";
import { SessionPackagesEditor } from "./session-packages-editor";
import editorStyles from "../service-editor.module.css";
import packageStyles from "./session-packages-editor.module.css";
import { SessionDraftGuard, revealInvalidSessionField } from "./session-draft-guard";
import { ServiceMediaFields } from "./service-media-fields";
import type { HourlyRate } from "@/lib/scheduling/pricing";

export function SessionTypeForm({ businessHours, timezone, canUpload, schedulingRules, rates, tags }: { businessHours: string[]; timezone: string; canUpload: boolean; schedulingRules: ReactNode; rates: HourlyRate[]; tags: string[] }) {
  const [state, action, pending] = useActionState(createServiceAction, { error: "" });
  const [values, setValues] = useState({ name: "", description: "", bufferBeforeMinutes: "0", bufferAfterMinutes: "15", minimumNoticeHours: "12", maxAdvanceDays: "60", slotIntervalMinutes: "30" });
  const [active, setActive] = useState(false);
  const field = (name: keyof typeof values) => ({ name, value: values[name], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues({ ...values, [name]: event.target.value }) });
  return <div className={`${styles.page} ${packageStyles.createPage} ${editorStyles.page}`}>
    <header className={`page-header ${styles.header}`}><h1>New session type</h1><ButtonLink href="/admin/modules/services" variant="ghost">Cancel</ButtonLink></header>
    <form id="new-session-type-form" action={action} className={`${styles.form} ${editorStyles.createGrid}`} onReset={event => event.preventDefault()} onInvalidCapture={revealInvalidSessionField}>
      <SessionDraftGuard formId="new-session-type-form" />
      <div className="product-studio-main">
      <section className="studio-panel"><fieldset><legend>Session details</legend>
        <label>Session type name<input {...field("name")} required placeholder="Family session" /></label>
        <label>Description <small>(optional)</small><textarea {...field("description")} rows={3} /></label>
        <ServiceMediaFields canUpload={canUpload} />
      </fieldset>
      </section>
      <SessionPackagesEditor initialRates={rates} requirePrice />
      </div>
      <aside className="product-studio-sidecar">
      <section className="studio-panel"><h2>Organization</h2><ServiceTagsField tags={tags} /></section>
      <section className="studio-panel"><fieldset><legend>Booking availability</legend>
        <p className={styles.hint}>{businessHours.length ? `Uses your business hours (${timezone}): ${businessHours.join(" · ")}.` : "Set your business hours below to activate this session type, or save a draft for now."}</p>
        {schedulingRules}
        <label>Session type status<select value={active ? "yes" : "no"} onChange={event => setActive(event.target.value === "yes")}><option value="no">Draft — finish setup later</option><option value="yes">Active — use my business hours</option></select></label>
        <p className={styles.hint}>Activate this session type to select it when booking a client. Online package selection is not available yet.</p>
        {active && <input type="hidden" name="isActive" value="on" />}
        {!businessHours.length && active && <fieldset><legend>Business hours ({timezone})</legend>
          <p className={styles.hint}>These hours apply to all your session types. You can adjust them later in your calendar.</p>
          <div className={styles.days}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => <label key={day}><input type="checkbox" name="weekdays" value={index} />{day}</label>)}</div>
          <div className={styles.row}><label>From<TimeInput name="hoursStart" required /></label><label>Until<TimeInput name="hoursEnd" required /></label></div>
        </fieldset>}
      </fieldset>
      </section>
      <section className="studio-panel"><details><summary>More scheduling options</summary>
        <div className={styles.row}><label>Preparation time <small>(minutes)</small><input {...field("bufferBeforeMinutes")} type="number" min="0" max="1440" /></label><label>Break after session <small>(minutes)</small><input {...field("bufferAfterMinutes")} type="number" min="0" max="1440" /></label></div>
        <label>Offer start times every <small>(minutes)</small><input {...field("slotIntervalMinutes")} type="number" min="1" max="1440" /></label>
        <div className={styles.row}><label>Minimum notice <small>(hours)</small><input {...field("minimumNoticeHours")} type="number" min="0" max="8760" /></label><label>Accept bookings up to <small>(days ahead)</small><input {...field("maxAdvanceDays")} type="number" min="1" max="3650" /></label></div>
      </details>
      </section>
      </aside>
      {state.error && <Notification tone="danger" eventKey={state}>{state.error}</Notification>}
      <footer className={editorStyles.saveFooter}><Button disabled={pending} type="submit">{pending ? "Saving…" : "Save session type"}</Button></footer>
    </form>
  </div>;
}
