"use client";

import { useRef, useState } from "react";
import { Button, Field, Input, Modal } from "@/components/ui";
import type { HourlyRate } from "@/lib/scheduling/pricing";
import { saveHourlyRateAction } from "../rate-actions";

export function HourlyRateEditor({ rate, onSave, onClose }: { rate?: HourlyRate; onSave: (rate: HourlyRate) => void; onClose: () => void }) {
  const [name, setName] = useState(rate?.name ?? "");
  const [amount, setAmount] = useState(rate ? (rate.amountCents / 100).toFixed(2) : "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const fields = useRef<HTMLDivElement>(null);
  async function save() {
    if (pending || [...(fields.current?.querySelectorAll("input") ?? [])].some(input => !input.reportValidity())) return;
    setPending(true); setError("");
    try {
      const result = await saveHourlyRateAction({ id: rate?.id, name, amount });
      if (result.error) setError(result.error);
      else if (result.rate) onSave(result.rate);
    } catch { setError("The rate could not be saved. Please try again."); }
    finally { setPending(false); }
  }
  return <Modal open title={rate ? "Edit hourly rate" : "New hourly rate"} onClose={() => { if (!pending) onClose(); }}>
    <div ref={fields} className="stack" onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); event.stopPropagation(); void save(); } }}>
      <Field label="Rate name"><Input autoFocus required maxLength={120} value={name} disabled={pending} placeholder="Standard photography" onChange={event => setName(event.target.value)} /></Field>
      <Field label="Rate per hour (USD)"><Input required type="number" min="0" max="9999999.99" step="0.01" inputMode="decimal" value={amount} disabled={pending} onChange={event => setAmount(event.target.value)} /></Field>
      {rate && <p className="ui-field-hint">Changes apply to new bookings for services using this rate. Existing bookings keep their saved prices.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="module-modal-actions"><Button type="button" variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button><Button type="button" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save rate"}</Button></div>
    </div>
  </Modal>;
}

export function HourlyRates({ initialRates }: { initialRates: HourlyRate[] }) {
  const [rates, setRates] = useState(initialRates);
  const [editing, setEditing] = useState<HourlyRate | "new" | null>(null);
  return <div className="stack">
    <header className="page-header"><h1>Hourly rates</h1><Button onClick={() => setEditing("new")}>Add rate</Button></header>
    <section className="studio-panel">
      <p className="ui-field-hint">Define named rates, then choose them on session types and included services.</p>
      {rates.length ? <ul className="hourly-rate-list">{rates.map(rate => <li key={rate.id}><span><strong>{rate.name}</strong><span>{(rate.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} / hour</span></span><Button variant="secondary" onClick={() => setEditing(rate)} aria-label={`Edit ${rate.name}`}>Edit</Button></li>)}</ul> : <p>No hourly rates yet. Add a rate to start offering hourly services.</p>}
    </section>
    {editing && <HourlyRateEditor rate={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSave={rate => { setRates(current => [...current.filter(item => item.id !== rate.id), rate].sort((a, b) => a.name.localeCompare(b.name))); setEditing(null); }} />}
  </div>;
}
