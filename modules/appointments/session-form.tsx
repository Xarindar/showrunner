"use client";

import { TimeInput } from "@/components/ui/time-input";
import { Notification } from "@/components/ui/notifications";

import { useActionState, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { createSessionAction } from "./create-action";
import styles from "./session-form.module.css";
import { selectSessionPackage, sessionAddOnPriceCents, suggestedSessionAddOns, type SessionOffering } from "@/lib/scheduling/session-offering";
import { hourlyPriceCents, type HourlyRate, type PricingType } from "@/lib/scheduling/pricing";

type Service = { id: string; name: string; durationMinutes: number; priceCents: number | null; pricingType: PricingType; hourlyRate: HourlyRate | null; sessionOffering: SessionOffering | null; staffAssignments: { staffId: string }[] };
type Client = { id: string; name: string; email: string; phone: string | null };

export function SessionForm({ services, clients, staff, timezone, rates }: { services: Service[]; clients: Client[]; staff: { id: string; name: string }[]; timezone: string; rates: HourlyRate[] }) {
  const [state, action, pending] = useActionState(createSessionAction, { error: "" });
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("CONFIRMED");
  const [staffId, setStaffId] = useState(staff.length === 1 ? staff[0].id : "");
  const [clientId, setClientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [tierId, setTierId] = useState("");
  const [addOnQuantities, setAddOnQuantities] = useState<Record<string, string>>({});
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
    setAddOnQuantities({});
    setDetails(service ? { name: service.name, duration: String(service.durationMinutes), price: service.priceCents == null ? "" : (service.priceCents / 100).toFixed(2) } : { name: "", duration: "60", price: "" });
  }
  function quantitiesFor(extras: string[], values = addOnQuantities) {
    return Object.fromEntries(extras.filter(id => selected?.sessionOffering?.addOns.some(item => item.id === id && item.pricingType === "PER_UNIT")).map(id => [id, Number(values[id] ?? 1)]));
  }
  function choosePackage(id: string, extras: string[], quantities = addOnQuantities, preserveDetails = false) {
    setTierId(id);
    setAddOnIds(extras);
    const counts = quantitiesFor(extras, quantities);
    if (Object.values(counts).some(value => !Number.isInteger(value) || value < 1 || value > 10000)) return;
    const duration = Number(details.duration);
    const pack = selectSessionPackage(selected?.sessionOffering, id, extras, preserveDetails && Number.isInteger(duration) && duration >= 1 && duration <= 1440 ? duration : undefined, counts);
    if (pack && selected) setDetails(current => ({ ...(preserveDetails ? current : { name: selected.name, duration: String(pack.durationMinutes) }), price: pack.priceCents == null ? "" : (pack.priceCents / 100).toFixed(2) }));
  }
  const selectedTier = selected?.sessionOffering?.tiers.find(tier => tier.id === tierId);
  const suggestedAddOns = selected?.sessionOffering ? suggestedSessionAddOns(selected.sessionOffering, tierId) : [];
  const hourly = selectedTier?.pricingType
    ? selectedTier.pricingType === "HOURLY" && rates.find(rate => rate.id === selectedTier.hourlyRateId)
    : selected?.pricingType === "HOURLY" && selected.hourlyRate;
  let extrasCents = 0;
  try { extrasCents = selected?.sessionOffering?.addOns.filter(item => addOnIds.includes(item.id)).reduce((total, item) => total + sessionAddOnPriceCents(item, Number(details.duration) || selectedTier?.durationMinutes || 60, item.pricingType === "PER_UNIT" ? Number(addOnQuantities[item.id] ?? 1) : 1), 0) ?? 0; } catch { /* Duration validation is handled by the form. */ }
  let calculatedPrice = "";
  if (hourly && details.duration) {
    try { calculatedPrice = ((hourlyPriceCents(hourly.amountCents, Number(details.duration)) + extrasCents) / 100).toFixed(2); }
    catch { /* Invalid duration or price is reported by the form and server validation. */ }
  }
  return <div className={styles.page}>
    <header className={`page-header ${styles.header}`}><h1>New session</h1><ButtonLink href="/admin/modules/appointments" variant="ghost">Cancel</ButtonLink></header>
    <form action={action} className={styles.form} onReset={event => event.preventDefault()}>
      <input type="hidden" name="addOnQuantities" value={JSON.stringify(quantitiesFor(addOnIds))} />
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
          {suggestedAddOns.length > 0 && <fieldset><legend>Suggested Add-Ons</legend><div className={styles.addOns}>{suggestedAddOns.map(item => <div key={item.id} className={styles.addOn}>
            <label><input type="checkbox" name="addOnIds" value={item.id} checked={addOnIds.includes(item.id)} onChange={event => choosePackage(tierId, event.target.checked ? [...addOnIds, item.id] : addOnIds.filter(id => id !== item.id))} />{item.name} (+{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(item.priceCents / 100)}{item.pricingType === "HOURLY" ? " / hour" : item.pricingType === "PER_UNIT" ? " / unit" : ""})</label>
            {item.pricingType === "PER_UNIT" && addOnIds.includes(item.id) && <label>Quantity<input aria-label={`${item.name} quantity`} type="number" min="1" max="10000" step="1" required value={addOnQuantities[item.id] ?? "1"} onChange={event => {
              const next = { ...addOnQuantities, [item.id]: event.target.value };
              setAddOnQuantities(next);
              if (event.target.validity.valid && event.target.value) choosePackage(tierId, addOnIds, next, true);
            }} /></label>}
          </div>)}</div></fieldset>}

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
