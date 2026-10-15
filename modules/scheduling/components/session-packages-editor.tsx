"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { Copy, Plus, X } from "lucide-react";
import { Button } from "@/components/ui";
import { sessionOfferingDraft, weddingCoverageSuggestions, type SessionOffering, type SessionOfferingDraft } from "@/lib/scheduling/session-offering";
import styles from "./session-packages-editor.module.css";

const mobileQuery = "(max-width: 767px)";
function subscribeToViewport(callback: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const isMobileViewport = () => window.matchMedia(mobileQuery).matches;
const serverViewport = () => false;

export function SessionPackagesEditor({ initialOffering = null, durationMinutes = 60, priceCents = null, suggestions = [], requirePrice = false }: {
  initialOffering?: SessionOffering | null; durationMinutes?: number; priceCents?: number | null; suggestions?: string[]; requirePrice?: boolean;
}) {
  const [draft, setDraft] = useState(() => sessionOfferingDraft(initialOffering, durationMinutes, priceCents));
  const mobile = useSyncExternalStore(subscribeToViewport, isMobileViewport, serverViewport);
  const [expandedTiers, setExpandedTiers] = useState(() => new Set([draft.tiers[0].id]));
  const [newCoverage, setNewCoverage] = useState("");
  const [message, setMessage] = useState("");
  const listId = useId();
  const multi = draft.tiers.length > 1;
  const choices = [...new Set([...weddingCoverageSuggestions, ...suggestions])].filter(name => !draft.coverageItems.some(item => item.name.toLowerCase() === name.toLowerCase()));
  const updateTier = (id: string, changes: Partial<SessionOfferingDraft["tiers"][number]>) => setDraft(current => ({ ...current, tiers: current.tiers.map(tier => tier.id === id ? { ...tier, ...changes } : tier) }));

  function addTier(source?: SessionOfferingDraft["tiers"][number]) {
    const base = source?.name || "Package";
    let name = source ? `${base} copy` : "";
    let suffix = 2;
    while (source && draft.tiers.some(tier => tier.name.toLowerCase() === name.toLowerCase())) name = `${base} copy ${suffix++}`;
    const id = crypto.randomUUID();
    setDraft({ ...draft, tiers: [...draft.tiers, { id, name, price: source?.price ?? "", durationMinutes: source?.durationMinutes ?? "", coverageIds: [...(source?.coverageIds ?? [])] }] });
    setExpandedTiers(new Set([id]));
    setMessage(source ? `Duplicated ${source.name}. Rename it and adjust what is included.` : "Added a blank tier. Enter its name, price, duration, and included coverage.");
  }

  function addCoverage(names: string[]) {
    const existing = new Set(draft.coverageItems.map(item => item.name.trim().toLowerCase()));
    const items = names.map(name => name.trim()).filter(name => name && !existing.has(name.toLowerCase())).map(name => ({ id: crypto.randomUUID(), name }));
    if (!items.length) { setMessage("That coverage item is already in the list."); return; }
    setDraft({ ...draft, coverageItems: [...draft.coverageItems, ...items].slice(0, 100) });
    setNewCoverage("");
    setMessage("Coverage added. Choose which packages include it.");
  }

  return <section className={styles.editor} aria-label="Package tiers">
    <input type="hidden" name="sessionOffering" value={JSON.stringify(draft)} />
    <input type="hidden" name="durationMinutes" value={draft.tiers[0].durationMinutes} />
    <input type="hidden" name="price" value={draft.tiers[0].price} />
    <div className={styles.heading}>
      <h2>{multi ? "Package tiers" : "Package"}</h2>
      {!mobile && <Button type="button" variant="secondary" size="sm" disabled={draft.tiers.length >= 10} onClick={() => addTier()}><Plus size={16} />Add another tier</Button>}
    </div>
    {mobile ? <div className={styles.tierCards}>
      {draft.tiers.map((tier, index) => <details key={tier.id} className={styles.tierCard} open={expandedTiers.has(tier.id)} onInvalidCapture={() => {
        // Reveal invalid fields before the browser tries to focus them.
        flushSync(() => setExpandedTiers(current => new Set([...current, tier.id])));
      }}>
        <summary onClick={event => {
          event.preventDefault();
          setExpandedTiers(current => { const next = new Set(current); if (next.has(tier.id)) next.delete(tier.id); else next.add(tier.id); return next; });
        }}><span>{tier.name || `Package ${index + 1}`}<small>{tier.price ? `$${tier.price}` : "Price not set"} · {tier.durationMinutes || "—"} minutes</small></span></summary>
        <div className={styles.tierBody}>
          <label>Package name<input aria-label={`Package ${index + 1} name`} value={tier.name} required maxLength={120} onChange={event => updateTier(tier.id, { name: event.target.value })} /></label>
          <div className={styles.tierNumbers}>
          <label>Price (USD)<input aria-label={`${tier.name} price (USD)`} type="number" inputMode="decimal" min="0" max="9999999.99" step="0.01" required={requirePrice || multi} placeholder="0.00" value={tier.price} onChange={event => updateTier(tier.id, { price: event.target.value })} /></label>
          <label>Coverage (minutes)<input aria-label={`${tier.name} duration (minutes)`} type="number" inputMode="numeric" min="1" max="1440" required value={tier.durationMinutes} onChange={event => updateTier(tier.id, { durationMinutes: event.target.value })} /></label>
          </div>
          <fieldset className={styles.tierCoverage}><legend>Included coverage</legend>
            {draft.coverageItems.length === 0 && <p className={styles.hint}>Add coverage items below, then choose what this tier includes.</p>}
            {draft.coverageItems.map(item => <label key={item.id}><input type="checkbox" aria-label={`Include ${item.name} in ${tier.name}`} checked={tier.coverageIds.includes(item.id)} onChange={event => updateTier(tier.id, { coverageIds: event.target.checked ? [...tier.coverageIds, item.id] : tier.coverageIds.filter(id => id !== item.id) })} /><span>{item.name}</span></label>)}
          </fieldset>
          {multi && <div className={styles.actions}>
            <Button type="button" size="sm" variant="ghost" aria-label={`Duplicate ${tier.name}`} disabled={draft.tiers.length >= 10} onClick={() => addTier(tier)}><Copy size={15} />Duplicate</Button>
            <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${tier.name}`} onClick={() => { setDraft({ ...draft, tiers: draft.tiers.filter(item => item.id !== tier.id) }); setMessage(`Removed ${tier.name} from this draft.`); }}><X size={15} />Remove</Button>
          </div>}
        </div>
      </details>)}
      <Button type="button" variant="secondary" disabled={draft.tiers.length >= 10} onClick={() => addTier()}><Plus size={16} />Add another tier</Button>
      <div className={styles.sharedCoverage}>
        <h3>Coverage items</h3><p className={styles.hint}>Define each item once, then include it in any tier above.</p>
        {draft.coverageItems.map((item, index) => <div className={styles.coverageName} key={item.id}>
          <input aria-label={`Coverage item ${index + 1}`} value={item.name} required maxLength={120} onChange={event => setDraft({ ...draft, coverageItems: draft.coverageItems.map(row => row.id === item.id ? { ...row, name: event.target.value } : row) })} />
          <Button type="button" size="sm" variant="ghost" aria-label={`Remove coverage ${item.name}`} onClick={() => setDraft({ ...draft, coverageItems: draft.coverageItems.filter(row => row.id !== item.id), tiers: draft.tiers.map(tier => ({ ...tier, coverageIds: tier.coverageIds.filter(id => id !== item.id) })) })}><X size={15} /></Button>
        </div>)}
      </div>
    </div> : <div className={styles.scroll} role="region" aria-label="Compare and edit package tiers" tabIndex={0}>
      <table className={styles.matrix}>
        <caption className="ui-sr-only">Package prices, durations, and included coverage</caption>
        <thead><tr><th scope="col">Package details</th>{draft.tiers.map((tier, index) => <th scope="col" key={tier.id}>
          <label>Package name<input aria-label={`Package ${index + 1} name`} value={tier.name} required maxLength={120} onChange={event => updateTier(tier.id, { name: event.target.value })} /></label>
          {multi && <div className={styles.actions}>
            <Button type="button" size="sm" variant="ghost" aria-label={`Duplicate ${tier.name}`} disabled={draft.tiers.length >= 10} onClick={() => addTier(tier)}><Copy size={15} />Duplicate</Button>
            <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${tier.name}`} onClick={() => { setDraft({ ...draft, tiers: draft.tiers.filter(item => item.id !== tier.id) }); setMessage(`Removed ${tier.name} from this draft.`); }}><X size={15} /></Button>
          </div>}
        </th>)}</tr></thead>
        <tbody>
          <tr><th scope="row">Price <small>(USD)</small></th>{draft.tiers.map(tier => <td key={tier.id}><input aria-label={`${tier.name} price (USD)`} type="number" inputMode="decimal" min="0" max="9999999.99" step="0.01" required={requirePrice || multi} placeholder="0.00" value={tier.price} onChange={event => updateTier(tier.id, { price: event.target.value })} /></td>)}</tr>
          <tr><th scope="row">Coverage <small>(minutes)</small></th>{draft.tiers.map(tier => <td key={tier.id}><input aria-label={`${tier.name} duration (minutes)`} type="number" min="1" max="1440" required value={tier.durationMinutes} onChange={event => updateTier(tier.id, { durationMinutes: event.target.value })} /></td>)}</tr>
          {draft.coverageItems.map((item, index) => <tr key={item.id}>
            <th scope="row"><div className={styles.coverageName}>
              <input aria-label={`Coverage item ${index + 1}`} value={item.name} required maxLength={120} onChange={event => setDraft({ ...draft, coverageItems: draft.coverageItems.map(row => row.id === item.id ? { ...row, name: event.target.value } : row) })} />
              <Button type="button" size="sm" variant="ghost" aria-label={`Remove coverage ${item.name}`} onClick={() => setDraft({ ...draft, coverageItems: draft.coverageItems.filter(row => row.id !== item.id), tiers: draft.tiers.map(tier => ({ ...tier, coverageIds: tier.coverageIds.filter(id => id !== item.id) })) })}><X size={15} /></Button>
            </div></th>
            {draft.tiers.map(tier => <td key={tier.id} className={styles.checkCell}><label><input type="checkbox" aria-label={`Include ${item.name} in ${tier.name}`} checked={tier.coverageIds.includes(item.id)} onChange={event => updateTier(tier.id, { coverageIds: event.target.checked ? [...tier.coverageIds, item.id] : tier.coverageIds.filter(id => id !== item.id) })} /><span className="ui-sr-only">Include {item.name} in {tier.name}</span></label></td>)}
          </tr>)}
        </tbody>
      </table>
    </div>}
    <div className={styles.addCoverage}>
      <label>Add coverage item<input list={listId} value={newCoverage} maxLength={120} placeholder="First look, ceremony, reception…" onChange={event => setNewCoverage(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addCoverage([newCoverage]); } }} /></label>
      <datalist id={listId}>{choices.map(name => <option key={name} value={name} />)}</datalist>
      <Button type="button" variant="secondary" disabled={!newCoverage.trim() || draft.coverageItems.length >= 100} onClick={() => addCoverage([newCoverage])}><Plus size={16} />Add item</Button>
      <Button type="button" variant="ghost" disabled={draft.coverageItems.length > 95 || weddingCoverageSuggestions.every(name => draft.coverageItems.some(item => item.name.toLowerCase() === name.toLowerCase()))} onClick={() => addCoverage(weddingCoverageSuggestions)}>Use wedding suggestions</Button>
    </div>
    <p className={styles.hint}>Coverage items are shared across your tiers. Checked items are included within the package’s coverage time.</p>
    <details className={styles.extras} open={draft.addOns.length > 0 || undefined}>
      <summary>Optional extras{draft.addOns.length ? ` (${draft.addOns.length})` : ""}</summary>
      {draft.addOns.map((item, index) => <div className={styles.extraRow} key={item.id}>
        <label>Extra name<input aria-label={`Extra ${index + 1} name`} value={item.name} required maxLength={120} onChange={event => setDraft({ ...draft, addOns: draft.addOns.map(row => row.id === item.id ? { ...row, name: event.target.value } : row) })} /></label>
        <label>Price (USD)<input aria-label={`Extra ${index + 1} price (USD)`} type="number" min="0" max="9999999.99" step="0.01" required value={item.price} onChange={event => setDraft({ ...draft, addOns: draft.addOns.map(row => row.id === item.id ? { ...row, price: event.target.value } : row) })} /></label>
        <Button type="button" variant="ghost" aria-label={`Remove extra ${item.name || index + 1}`} onClick={() => setDraft({ ...draft, addOns: draft.addOns.filter(row => row.id !== item.id) })}><X size={16} /></Button>
      </div>)}
      <Button type="button" variant="secondary" size="sm" disabled={draft.addOns.length >= 50} onClick={() => setDraft({ ...draft, addOns: [...draft.addOns, { id: crypto.randomUUID(), name: "", price: "" }] })}><Plus size={16} />Add optional extra</Button>
    </details>
    <p role="status" className={styles.hint}>{message}</p>
  </section>;
}
