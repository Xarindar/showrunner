"use client";

import { useId, useState } from "react";
import { flushSync } from "react-dom";
import { Copy, Plus, X } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { sessionOfferingDraft, type SessionOffering, type SessionOfferingDraft } from "@/lib/scheduling/session-offering";
import type { ServiceLibraryItem } from "@/lib/scheduling/service-library";
import { ServiceLibraryMenu } from "./service-library-menu";
import { ServiceLibraryPicker } from "./service-library-picker";
import styles from "./session-packages-editor.module.css";
import { hourlyPriceCents, type HourlyRate, type PricingType } from "@/lib/scheduling/pricing";
import { ServicePricingFields } from "./service-pricing-fields";

export function SessionPackagesEditor({ initialOffering = null, durationMinutes = 60, priceCents = null, requirePrice = false, initialRates = [], initialPricingType = "FLAT_RATE", initialHourlyRateId = "" }: {
  initialOffering?: SessionOffering | null; durationMinutes?: number; priceCents?: number | null; requirePrice?: boolean;
  initialRates?: HourlyRate[]; initialPricingType?: PricingType; initialHourlyRateId?: string;
}) {
  const [draft, setDraft] = useState(() => sessionOfferingDraft(initialOffering, durationMinutes, priceCents));
  const [expandedTiers, setExpandedTiers] = useState(() => new Set<string>());
  const [libraryPicker, setLibraryPicker] = useState<{ editingItem?: SessionOffering["coverageItems"][number] } | null>(null);
  const [inlineService, setInlineService] = useState<SessionOffering["coverageItems"][number] | null>(null);
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [removal, setRemoval] = useState<{ kind: "service" | "package" | "extra"; id: string; name: string } | null>(null);
  const [newTiers, setNewTiers] = useState(() => new Set<string>());
  const [message, setMessage] = useState("");
  const [rates, setRates] = useState(initialRates);
  const [pricingType, setPricingType] = useState(initialPricingType);
  const [hourlyRateId, setHourlyRateId] = useState(initialHourlyRateId);
  const hourlyRate = rates.find(rate => rate.id === hourlyRateId);
  const onRateSaved = (rate: HourlyRate) => setRates(current => [...current.filter(item => item.id !== rate.id), rate].sort((a, b) => a.name.localeCompare(b.name)));
  const tierPrice = (tier: SessionOfferingDraft["tiers"][number]) => {
    if (pricingType !== "HOURLY") return tier.price;
    if (!hourlyRate || !tier.durationMinutes) return "";
    try { return (hourlyPriceCents(hourlyRate.amountCents, Number(tier.durationMinutes)) / 100).toFixed(2); }
    catch { return ""; }
  };
  const listId = useId();
  const multi = draft.tiers.length > 1;
  const updateTier = (id: string, changes: Partial<SessionOfferingDraft["tiers"][number]>) => setDraft(current => ({ ...current, tiers: current.tiers.map(tier => tier.id === id ? { ...tier, ...changes } : tier) }));

  function closeLibrary() {
    setLibraryPicker(null);
    setInlineService(null);
    setExpandedService(null);
    requestAnimationFrame(() => {
      document.getElementById(`${listId}-included-title`)?.focus();
    });
  }

  function addTier(source?: SessionOfferingDraft["tiers"][number]) {
    const base = source?.name || "Package";
    let name = source ? `${base} copy` : "";
    let suffix = 2;
    while (source && draft.tiers.some(tier => tier.name.toLowerCase() === name.toLowerCase())) name = `${base} copy ${suffix++}`;
    const id = crypto.randomUUID();
    flushSync(() => {
      setDraft({ ...draft, tiers: [...draft.tiers, { id, name, price: source?.price ?? "", durationMinutes: source?.durationMinutes ?? "", coverageIds: [...(source?.coverageIds ?? [])] }] });
      setExpandedTiers(new Set([id]));
      setNewTiers(current => new Set([...current, id]));
    });
    document.getElementById(`${listId}-${id}`)?.focus();
    setMessage(source ? `Duplicated ${source.name}. Rename it and adjust what is included.` : "Added a blank package. Enter its name, price, duration, and what's included.");
  }

  function chooseLibraryItems(items: ServiceLibraryItem[], candidate = inlineService?.id || libraryPicker?.editingItem?.id || null) {
    const editingId = draft.coverageItems.some(item => item.id === candidate) ? candidate : undefined;
    setDraft(current => {
      const included = items.map(({ id, ...item }) => ({ ...item, id: editingId || crypto.randomUUID(), libraryItemId: id }));
      return { ...current, coverageItems: editingId
        ? current.coverageItems.map(item => item.id === editingId ? included[0] : item)
        : [...current.coverageItems, ...included.filter(item => !current.coverageItems.some(row => row.libraryItemId === item.libraryItemId || row.name.toLowerCase() === item.name.toLowerCase()))].slice(0, 100)
      };
    });
    closeLibrary();
    setMessage(editingId ? "Service updated. Save the session type to keep these details." : "Services added. Choose which packages include them, then save the session type.");
  }

  return <div className={styles.editor}>
    <input type="hidden" name="pricingType" value={pricingType} />
    <input type="hidden" name="hourlyRateId" value={pricingType === "HOURLY" ? hourlyRateId : ""} />
    <input type="hidden" name="sessionOffering" value={JSON.stringify({ ...draft, tiers: draft.tiers.map(tier => ({ ...tier, price: tierPrice(tier) })) })} />
    <input type="hidden" name="durationMinutes" value={draft.tiers[0].durationMinutes} />
    <input type="hidden" name="price" value={tierPrice(draft.tiers[0])} />
    <section className="studio-panel" aria-label="Session pricing">
      <h2>Pricing</h2>
      <ServicePricingFields pricingType={pricingType} hourlyRateId={hourlyRateId} rates={rates} onChange={(type, rateId) => { setPricingType(type); setHourlyRateId(rateId); }} onRateSaved={onRateSaved} />
      {pricingType === "HOURLY" && <p className={styles.hint}>Package totals use this rate × duration. Optional extras are added once.</p>}
    </section>
    <section className="studio-panel" aria-labelledby={`${listId}-included-title`}>
      <div className={styles.heading}><h2 id={`${listId}-included-title`} tabIndex={-1}>What’s included</h2></div>
      <p className={styles.hint}>Add reusable services, then choose which packages include each one below.</p>
      <div className={styles.optionList}>
        {draft.coverageItems.map(item => <div className={styles.optionRow} key={item.id}>
          {expandedService === item.id ? <>
            <ServiceLibraryPicker inline rates={rates} onRateSaved={onRateSaved} selectedItems={draft.coverageItems} editingItem={item} onChoose={chooseLibraryItems} onClose={closeLibrary} />
            <Button type="button" variant="danger" size="sm" onClick={() => setRemoval({ kind: "service", id: item.id, name: item.name })}>Remove from session</Button>
          </> : <button type="button" className={styles.optionSummary} onClick={() => { setExpandedService(item.id); setInlineService(item); }}>
            <strong>{item.name}</strong><span className={styles.chips}>{draft.tiers.filter(tier => tier.coverageIds.includes(item.id)).map(tier => <span className="ui-badge" key={tier.id}>{tier.name}</span>)}</span>
            {item.pricingType && <small>{item.pricingType === "HOURLY" ? `${rates.find(rate => rate.id === item.hourlyRateId)?.name || "Hourly rate"} · Hourly` : item.priceCents == null ? "Flat rate" : `$${(item.priceCents / 100).toFixed(2)} · Flat rate`}</small>}
            {item.description && <span className={styles.hint}>{item.description}</span>}
          </button>}
        </div>)}
        {inlineService && !draft.coverageItems.some(item => item.id === inlineService.id) && <div className={styles.optionRow}><h3>New service</h3><ServiceLibraryPicker inline rates={rates} onRateSaved={onRateSaved} selectedItems={draft.coverageItems} editingItem={inlineService} onChoose={chooseLibraryItems} onClose={closeLibrary} /></div>}
      </div>
      <div><ServiceLibraryMenu selectedItems={draft.coverageItems} onChoose={item => chooseLibraryItems([item], null)} onCreate={() => { setExpandedService(null); setInlineService({ id: crypto.randomUUID(), name: "" }); }} onBrowse={() => { setInlineService(null); setExpandedService(null); setLibraryPicker({}); }} /></div>
      {libraryPicker && <ServiceLibraryPicker rates={rates} onRateSaved={onRateSaved} selectedItems={draft.coverageItems} editingItem={libraryPicker.editingItem} onChoose={chooseLibraryItems} onClose={closeLibrary} />}
    </section>
    <section className="studio-panel" aria-labelledby={`${listId}-packages-title`}>
    <div className={styles.heading}><h2 id={`${listId}-packages-title`}>Packages</h2></div>
    <div className={styles.optionList}>
      {draft.tiers.map((tier, index) => <details key={tier.id} className={styles.tierCard} open={expandedTiers.has(tier.id)} onInvalidCapture={() => {
        flushSync(() => setExpandedTiers(current => new Set([...current, tier.id])));
      }}>
        <summary className={styles.optionSummary} onClick={event => { event.preventDefault(); setExpandedTiers(current => current.has(tier.id) ? new Set() : new Set([tier.id])); }}>
          <strong>{tier.name || `Package ${index + 1}`}</strong><small>{tierPrice(tier) ? `$${tierPrice(tier)}` : "Price not set"} · {tier.durationMinutes || "—"} minutes{pricingType === "HOURLY" ? " · Hourly" : ""}</small>
          <span className={styles.chips}>{draft.coverageItems.filter(item => tier.coverageIds.includes(item.id)).map(item => <span className="ui-badge" key={item.id}>{item.name}</span>)}</span>
        </summary>
        <div className={styles.tierBody}>
          <label>Package name<input id={`${listId}-${tier.id}`} aria-label={`Package ${index + 1} name`} value={tier.name} required maxLength={120} onChange={event => updateTier(tier.id, { name: event.target.value })} /></label>
          <div className={styles.tierNumbers}>
            <label>{pricingType === "HOURLY" ? "Calculated price (USD)" : "Price (USD)"}<input aria-label={`${tier.name} price (USD)`} type="number" inputMode="decimal" min="0" max="9999999.99" step="0.01" required={requirePrice || multi || pricingType === "HOURLY"} readOnly={pricingType === "HOURLY"} placeholder="0.00" value={tierPrice(tier)} onChange={event => updateTier(tier.id, { price: event.target.value })} /></label>
            <label>Duration (minutes)<input aria-label={`${tier.name} duration (minutes)`} type="number" inputMode="numeric" min="1" max="1440" required value={tier.durationMinutes} onChange={event => updateTier(tier.id, { durationMinutes: event.target.value })} /></label>
          </div>
          <fieldset className={styles.tierCoverage}><legend>Included in this package</legend>{draft.coverageItems.map(item => <label key={item.id}><input type="checkbox" aria-label={`Include ${item.name} in ${tier.name}`} checked={tier.coverageIds.includes(item.id)} onChange={event => updateTier(tier.id, { coverageIds: event.target.checked ? [...tier.coverageIds, item.id] : tier.coverageIds.filter(id => id !== item.id) })} /><span>{item.name}</span></label>)}</fieldset>
          <div className={styles.actions}><div className="ui-inline-actions">
            {newTiers.has(tier.id) ? <Button type="button" variant="ghost" onClick={() => { setDraft(current => ({ ...current, tiers: current.tiers.filter(item => item.id !== tier.id) })); setNewTiers(current => new Set([...current].filter(id => id !== tier.id))); }}>Cancel</Button> : <Button type="button" variant="danger" disabled={!multi} onClick={() => setRemoval({ kind: "package", id: tier.id, name: tier.name })}>Remove</Button>}
            <Button type="button" variant="secondary" disabled={draft.tiers.length >= 10} onClick={() => addTier(tier)}><Copy size={15} />Duplicate</Button>
          </div><Button type="button" onClick={event => {
            const fields = event.currentTarget.closest("details")?.querySelectorAll<HTMLInputElement>("input");
            if (fields && [...fields].some(field => !field.reportValidity())) return;
            if (draft.tiers.some(item => item.id !== tier.id && item.name.trim().toLowerCase() === tier.name.trim().toLowerCase())) { setMessage("Use a different name for each package."); return; }
            setExpandedTiers(new Set()); setNewTiers(current => new Set([...current].filter(id => id !== tier.id)));
          }}>Done</Button></div>
        </div>
      </details>)}
    </div>
    <Button type="button" variant="ghost" disabled={draft.tiers.length >= 10} onClick={() => addTier()}><Plus size={16} />Add package</Button>
    <details className={styles.extras} open={draft.addOns.length > 0 || undefined}>
      <summary>Optional extras{draft.addOns.length ? ` (${draft.addOns.length})` : ""}</summary>
      <p className={styles.hint}>Extras add to the package price. Adjust the duration when booking if an extra needs more time.</p>
      {draft.addOns.map((item, index) => <div className={styles.extraRow} key={item.id}>
        <label>Extra name<input aria-label={`Extra ${index + 1} name`} value={item.name} required maxLength={120} onChange={event => setDraft({ ...draft, addOns: draft.addOns.map(row => row.id === item.id ? { ...row, name: event.target.value } : row) })} /></label>
        <label>Price (USD)<input aria-label={`Extra ${index + 1} price (USD)`} type="number" min="0" max="9999999.99" step="0.01" required value={item.price} onChange={event => setDraft({ ...draft, addOns: draft.addOns.map(row => row.id === item.id ? { ...row, price: event.target.value } : row) })} /></label>
        <Button type="button" variant="ghost" aria-label={`Remove extra ${item.name || index + 1}`} onClick={() => setRemoval({ kind: "extra", id: item.id, name: item.name || `Extra ${index + 1}` })}><X size={16} /></Button>
      </div>)}
      <Button type="button" variant="secondary" size="sm" disabled={draft.addOns.length >= 50} onClick={() => setDraft({ ...draft, addOns: [...draft.addOns, { id: crypto.randomUUID(), name: "", price: "" }] })}><Plus size={16} />Add optional extra</Button>
    </details>
    </section>
    <p role="status" className={styles.hint}>{message}</p>
    {removal && <Modal open title={`Remove "${removal.name}"?`} onClose={() => setRemoval(null)}>
      <p>{removal.kind === "service" ? `This removes the service from this session and its package selections. It stays in your library.` : removal.kind === "package" ? "This removes the package and its selections. Your included services stay in this session and the library." : "This removes the optional extra from this session."}</p>
      <div className="module-modal-actions"><Button type="button" variant="secondary" autoFocus onClick={() => setRemoval(null)}>Cancel</Button><Button type="button" variant="danger" onClick={() => {
        setDraft(current => removal.kind === "service" ? { ...current, coverageItems: current.coverageItems.filter(item => item.id !== removal.id), tiers: current.tiers.map(tier => ({ ...tier, coverageIds: tier.coverageIds.filter(id => id !== removal.id) })) } : removal.kind === "package" ? { ...current, tiers: current.tiers.length > 1 ? current.tiers.filter(tier => tier.id !== removal.id) : current.tiers } : { ...current, addOns: current.addOns.filter(item => item.id !== removal.id) });
        setInlineService(null); setExpandedService(null); setRemoval(null); setMessage(`Removed ${removal.name} from this draft. Save the session type to keep the change.`);
      }}>Remove {removal.kind}</Button></div>
    </Modal>}
  </div>;
}
