"use client";

import { useActionState, useState } from "react";
import { Button, ButtonLink } from "@/components/ui";
import { createServiceAction } from "../actions";
import styles from "@/modules/appointments/session-form.module.css";
import { SessionPackagesEditor } from "./session-packages-editor";
import packageStyles from "./session-packages-editor.module.css";

export function SessionTypeForm({ businessHours, timezone, coverageSuggestions = [] }: { businessHours: string[]; timezone: string; coverageSuggestions?: string[] }) {
  const [state, action, pending] = useActionState(createServiceAction, { error: "" });
  const [values, setValues] = useState({ name: "", description: "", bufferBeforeMinutes: "0", bufferAfterMinutes: "15", minimumNoticeHours: "12", maxAdvanceDays: "60", slotIntervalMinutes: "30" });
  const [active, setActive] = useState(false);
  const field = (name: keyof typeof values) => ({ name, value: values[name], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues({ ...values, [name]: event.target.value }) });
  return <div className={`${styles.page} ${packageStyles.createPage}`}>
    <header className={styles.header}><h1>New session type</h1><ButtonLink href="/admin/modules/services" variant="ghost">Cancel</ButtonLink></header>
    <form action={action} className={styles.form} onReset={event => event.preventDefault()}>
      <fieldset><legend>Session details</legend>
        <label>Name<input {...field("name")} required placeholder="Family session" /></label>
        <label>Description <small>(optional)</small><textarea {...field("description")} rows={3} /></label>
      </fieldset>
      <SessionPackagesEditor suggestions={coverageSuggestions} requirePrice />
      <fieldset><legend>Booking availability</legend>
        <p className={styles.hint}>{businessHours.length ? `Uses your business hours (${timezone}): ${businessHours.join(" · ")}.` : "Set your business hours below to offer online booking, or save a draft for now."}</p>
        <label>Allow online booking<select value={active ? "yes" : "no"} onChange={event => setActive(event.target.value === "yes")}><option value="no">Not yet — save as draft</option><option value="yes">Yes — use my business hours</option></select></label>
        {active && <input type="hidden" name="isActive" value="on" />}
        {!businessHours.length && active && <fieldset><legend>Business hours ({timezone})</legend>
          <p className={styles.hint}>These hours apply to all your session types. You can adjust them later in your calendar.</p>
          <div className={styles.days}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => <label key={day}><input type="checkbox" name="weekdays" value={index} />{day}</label>)}</div>
          <div className={styles.row}><label>From<input type="time" name="hoursStart" required /></label><label>Until<input type="time" name="hoursEnd" required /></label></div>
        </fieldset>}
      </fieldset>
      <details><summary>More scheduling options</summary>
        <div className={styles.row}><label>Preparation time <small>(minutes)</small><input {...field("bufferBeforeMinutes")} type="number" min="0" max="1440" /></label><label>Break after session <small>(minutes)</small><input {...field("bufferAfterMinutes")} type="number" min="0" max="1440" /></label></div>
        <label>Offer start times every <small>(minutes)</small><input {...field("slotIntervalMinutes")} type="number" min="1" max="1440" /></label>
        <div className={styles.row}><label>Minimum notice <small>(hours)</small><input {...field("minimumNoticeHours")} type="number" min="0" max="8760" /></label><label>Accept bookings up to <small>(days ahead)</small><input {...field("maxAdvanceDays")} type="number" min="1" max="3650" /></label></div>
      </details>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      <footer className={styles.footer}><Button disabled={pending} type="submit">{pending ? "Saving…" : "Save session type"}</Button></footer>
    </form>
  </div>;
}
