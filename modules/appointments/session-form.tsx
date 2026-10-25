"use client";

import { TimeInput } from "@/components/ui/time-input";
import { Notification } from "@/components/ui/notifications";

import { useActionState, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { createSessionAction } from "./create-action";
import styles from "./session-form.module.css";
import { selectSessionPackage, type SessionOffering } from "@/lib/scheduling/session-offering";
import { hourlyPriceCents, type HourlyRate, type PricingType } from "@/lib/scheduling/pricing";

type Service = { id: string; name: string; durationMinutes: number; priceCents: number | null; pricingType: PricingType; hourlyRate: HourlyRate | null; sessionOffering: SessionOffering | null; staffAssignments: { staffId: string }[] };
type Client = { id: string; name: string; email: string; phone: string | null };

export function SessionForm({ services, clients, staff, timezone }: { services: Service[]; clients: Client[]; staff: { id: string; name: string }[]; timezone: string }) {
  const [state, action, pending] = useActionState(createSessionAction, { error: "" });
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("CONFIRMED");
  const [staffId, setStaffId] = useState(staff.length === 1 ? staff[0].id : "");
  const [clientId, setClientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [tierId, setTierId] = useState("");
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "" });
  const [details, setDetails] = useState({ name: "", duration: "60", price: "" });
  const selected = services.find(service => service.id === serviceId);
  const team = staff.filter(person => !selected?.staffAssignments.length || selected.staffAssignments.some(assignment => assignment.staffId === person.id));
  function chooseService(id: string) {
    setServiceId(id);
    setStaffId("");
    const service = services.find(item => item.id === id);
    setTierId(service?.sessionOffering?.tiers[0].id || "");
    setAddOnIds([]);
    setDetails(service ? { name: service.name, duration: String(service.durationMinutes), price: service.priceCents == null ? "" : (service.priceCents / 100).toFixed(2) } : { name: "", duration: "60", price: "" });
  }
  function choosePackage(id: string, extras: string[]) {
    const pack = selectSessionPackage(selected?.sessionOffering, id, extras);
    setTierId(id);
    setAddOnIds(extras);
    if (pack && selected) setDetails({ name: selected.name, duration: String(pack.durationMinutes), price: pack.priceCents == null ? "" : (pack.priceCents / 100).toFixed(2) });
  }
  const selectedTier = selected?.sessionOffering?.tiers.find(tier => tier.id === tierId);
  const hourly = selected?.pricingType === "HOURLY" && selected.hourlyRate;
  const extrasCents = selected?.sessionOffering?.addOns.filter(item => addOnIds.includes(item.id)).reduce((total, item) => total + item.priceCents, 0) ?? 0;
  let calculatedPrice = "";
  if (hourly && details.duration) {
    try { calculatedPrice = ((hourlyPriceCents(hourly.amountCents, Number(details.duration)) + extrasCents) / 100).toFixed(2); }
    catch { /* Invalid duration or price is reported by the form and server validation. */ }
  }
  return <div className={styles.page}>
    <header className={`page-header ${styles.header}`}><h1>New session</h1><ButtonLink href="/admin/modules/appointments" variant="ghost">Cancel</ButtonLink></header>
    <form action={action} className={styles.form} onReset={event => event.preventDefault()}>
      <fieldset><legend>Client</legend>
        {clients.length > 0 && <label>Existing client<select value={clientId} onChange={event => { setClientId(event.target.value); const client = clients.find(item => item.id === event.target.value); setCustomer(client ? { name: client.name, email: client.email, phone: client.phone || "" } : { name: "", email: "", phone: "" }); }}><option value="">New client</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name} · {client.email}</option>)}</select></label>}
        <label>Name<input autoComplete="name" name="customerName" required value={customer.name} onChange={event => setCustomer({ ...customer, name: event.target.value })} /></label>
        <div className={styles.row}><label>Email<input autoComplete="email" type="email" name="customerEmail" required value={customer.email} onChange={event => setCustomer({ ...customer, email: event.target.value })} /></label><label>Phone <small>(optional)</small><input autoComplete="tel" type="tel" name="customerPhone" value={customer.phone} onChange={event => setCustomer({ ...customer, phone: event.target.value })} /></label></div>
      </fieldset>
      <fieldset><legend>Session</legend>
        <label>Session type<select name="serviceId" value={serviceId} onChange={event => chooseService(event.target.value)}><option value="">One-off session</option>{services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
        {selected?.sessionOffering && <>
          <label>Package<select name="tierId" required value={tierId} onChange={event => choosePackage(event.target.value, [])}>{selected.sessionOffering.tiers.map(tier => <option key={tier.id} value={tier.id}>{tier.name}</option>)}</select></label>
          {selectedTier && <p className={styles.hint}>{selected.sessionOffering.coverageItems.filter(item => selectedTier.coverageIds.includes(item.id)).map(item => item.name).join(" · ")}</p>}
          {selected.sessionOffering.addOns.length > 0 && <fieldset><legend>Optional extras</legend><div className={styles.days}>{selected.sessionOffering.addOns.map(item => <label key={item.id}><input type="checkbox" name="addOnIds" value={item.id} checked={addOnIds.includes(item.id)} onChange={event => choosePackage(tierId, event.target.checked ? [...addOnIds, item.id] : addOnIds.filter(id => id !== item.id))} />{item.name} (+{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(item.priceCents / 100)})</label>)}</div></fieldset>}
        </>}
        <label>Session name<input name="name" required placeholder="Family photos" value={details.name} onChange={event => setDetails({ ...details, name: event.target.value })} /></label>
        <div className={styles.row}><label>Date<input type="date" name="date" defaultValue={state.date || ""} required /></label><label>Time <small>({timezone})</small><TimeInput name="time" defaultValue={state.time || ""} required /></label></div>
        <div className={styles.row}><label>Duration <small>(minutes)</small><input type="number" name="durationMinutes" min="1" max="1440" required value={details.duration} onChange={event => setDetails({ ...details, duration: event.target.value })} /></label><label>Price <small>(USD)</small><input inputMode="decimal" type="number" name="price" min="0" max="9999999.99" step="0.01" placeholder="0.00" required readOnly={Boolean(hourly)} value={hourly ? calculatedPrice : details.price} onChange={event => setDetails({ ...details, price: event.target.value })} /></label></div>
        {hourly && <p className={styles.hint}>{hourly.name}: ${(hourly.amountCents / 100).toFixed(2)} / hour × booked duration{extrasCents ? " + optional extras" : ""}.</p>}
        <p className={styles.hint}>Arrange the location with your client after booking.</p>
        {team.length > 0 && <label>Team member<select key={serviceId} name="staffId" required={Boolean(selected?.staffAssignments.length)} value={staffId} onChange={event => setStaffId(event.target.value)}><option value="">Choose a team member</option>{team.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>}
      </fieldset>
      <details><summary>Notes and confirmation</summary><label>Notes<textarea name="notes" rows={3} value={notes} onChange={event => setNotes(event.target.value)} /></label><label>Booking status<select name="status" value={status} onChange={event => setStatus(event.target.value)}><option value="CONFIRMED">Confirmed</option><option value="PENDING">Awaiting confirmation</option></select></label></details>
      <p className={styles.hint}>Saves to your calendar and client record. No email or payment request is sent.</p>
      {state.error && <Notification tone="danger" eventKey={state}>{state.error}</Notification>}
      <footer className={styles.footer}><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Create session"}</Button></footer>
    </form>
  </div>;
}
