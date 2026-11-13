"use client";

import { TimeInput } from "@/components/ui/time-input";
import { formatTimeValue } from "@/lib/format";
import { serviceTimeFrameSchema, timeFrameMinutes, editTimeFrame } from "@/lib/scheduling/service-time-frame";
import { ResponsiveTableFrame } from "@/components/ui/responsive-table";
import { useId, useState } from "react";
import { flushSync } from "react-dom";
import { Copy, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { sessionOfferingDraft, type SessionOffering, type SessionOfferingDraft } from "@/lib/scheduling/session-offering";
import type { ServiceLibraryItem } from "@/lib/scheduling/service-library";
import { ServiceLibraryPicker } from "./service-library-picker";
import styles from "./session-packages-editor.module.css";
import { hourlyPriceCents, type HourlyRate, type PricingType } from "@/lib/scheduling/pricing";
import { ServicePricingFields } from "./service-pricing-fields";
import { useNotify } from "@/components/ui/notifications";

const maxDurationHours = 24;
const durationHours = Array.from({ length: maxDurationHours + 1 }, (_, index) => index);
const durationMinutesOfHour = Array.from({ length: 60 }, (_, index) => index);

const deliverableFields = [
  ["locations", "Locations"],
  ["outfitChanges", "Outfit changes"],
  ["finalPhotos", "Final photos"]
] as const;

function packageDurationLabel(value: string) {
  const total = Number(value), hours = Math.floor(total / 60), minutes = total % 60;
  return hours ? `${hours} hr${minutes ? ` ${minutes} min` : ""}` : `${minutes} min`;
}

export function SessionPackagesEditor({ initialOffering = null, durationMinutes = 60, priceCents = null, isNew = false, initialRates = [], initialPricingType = "FLAT_RATE", initialHourlyRateId = "", initialScheduling }: {
  initialOffering?: SessionOffering | null; durationMinutes?: number; priceCents?: number | null; isNew?: boolean;
  initialRates?: HourlyRate[]; initialPricingType?: PricingType; initialHourlyRateId?: string;
  initialScheduling?: { bufferBeforeMinutes: number; bufferAfterMinutes: number; minimumNoticeHours: number; maxAdvanceDays: number; slotIntervalMinutes: number };
}) {
  const [storedDraft, setDraft] = useState<SessionOfferingDraft>(() => {
    if (isNew && !initialOffering) return { coverageItems: [], tiers: [], addOns: [] };
    const offering = sessionOfferingDraft(initialOffering, durationMinutes, priceCents);
    return { ...offering, tiers: offering.tiers.map(tier => ({ ...tier, pricingType: tier.pricingType ?? initialPricingType, hourlyRateId: (tier.pricingType ? tier.hourlyRateId : initialHourlyRateId) || null })) };
  });
  const draft = { ...storedDraft, tiers: storedDraft.tiers.map(tier => {
    const frame = tier.pricingType === "TIME_FRAME" ? serviceTimeFrameSchema.safeParse(tier.timeFrame) : null;
    if (!frame?.success) return tier;
    const { start, end } = timeFrameMinutes(frame.data);
    return { ...tier, durationMinutes: String(end - start) };
  }) };
  const timeFrameLabel = (tier: SessionOfferingDraft["tiers"][number]) => `${formatTimeValue(tier.timeFrame?.start ?? "")} – ${formatTimeValue(tier.timeFrame?.end ?? "")}${tier.timeFrame?.endsNextDay ? " (next day)" : ""}`;
  const [scheduling, setScheduling] = useState(() => ({
    bufferBeforeMinutes: String(initialScheduling?.bufferBeforeMinutes ?? 0),
    bufferAfterMinutes: String(initialScheduling?.bufferAfterMinutes ?? 15),
    minimumNoticeHours: String(initialScheduling?.minimumNoticeHours ?? 12),
    maxAdvanceDays: String(initialScheduling?.maxAdvanceDays ?? 60),
    slotIntervalMinutes: String(initialScheduling?.slotIntervalMinutes ?? 30)
  }));
  const [expandedTiers, setExpandedTiers] = useState(() => new Set<string>());
  const [libraryPicker, setLibraryPicker] = useState<{ editingItem?: SessionOffering["coverageItems"][number]; optional?: boolean; tierId?: string } | null>(null);
  const [removal, setRemoval] = useState<{ kind: "package" | "extra"; id: string; name: string } | null>(null);
  const [newTiers, setNewTiers] = useState(() => new Set<string>());
  const notify = useNotify();
  const [rates, setRates] = useState(initialRates);
  const onRateSaved = (rate: HourlyRate) => setRates(current => [...current.filter(item => item.id !== rate.id), rate].sort((a, b) => a.name.localeCompare(b.name)));
  const tierPrice = (tier: SessionOfferingDraft["tiers"][number]) => {
    if (tier.pricingType !== "HOURLY") return tier.price;
    const hourlyRate = rates.find(rate => rate.id === tier.hourlyRateId);
    if (!hourlyRate || !tier.durationMinutes) return "";
    try { return (hourlyPriceCents(hourlyRate.amountCents, Number(tier.durationMinutes)) / 100).toFixed(2); }
    catch { return ""; }
  };
  const listId = useId();
  const firstTier = draft.tiers[0];
  const multi = draft.tiers.length > 1;
  const canDiscardTier = isNew || multi;
  const libraryTier = draft.tiers.find(tier => tier.id === libraryPicker?.tierId);
  const updateTier = (id: string, changes: Partial<SessionOfferingDraft["tiers"][number]>) => setDraft(current => ({ ...current, tiers: current.tiers.map(tier => tier.id === id ? { ...tier, ...changes } : tier) }));

  function discardTier(id: string) {
    setDraft(current => !isNew && current.tiers.length <= 1 ? current : {
      ...current,
      tiers: current.tiers.filter(tier => tier.id !== id)
    });
    setNewTiers(current => new Set([...current].filter(tierId => tierId !== id)));
  }

  function closeLibrary() {
    setLibraryPicker(null);
    requestAnimationFrame(() => {
      const target = libraryPicker?.tierId
        ? libraryPicker.editingItem ? `${listId}-edit-${libraryPicker.tierId}-${libraryPicker.editingItem.id}` : `${listId}-services-${libraryPicker.tierId}`
        : `${listId}-${libraryPicker?.optional ? "optional-title" : "packages-title"}`;
      document.getElementById(target)?.focus();
    });
  }

  function addTier(source?: SessionOfferingDraft["tiers"][number]) {
    const base = source?.name || "Package";
    let name = source ? `${base} copy` : "";
    let suffix = 2;
    while (source && draft.tiers.some(tier => tier.name.toLowerCase() === name.toLowerCase())) name = `${base} copy ${suffix++}`;
    const id = crypto.randomUUID();
    flushSync(() => {
      setExpandedTiers(new Set());
      setDraft({ ...draft, tiers: [...draft.tiers, { id, name, price: source?.price ?? "", durationMinutes: source?.durationMinutes ?? String(durationMinutes), pricingType: source?.pricingType ?? "FLAT_RATE", timeFrame: source?.timeFrame, hourlyRateId: source?.hourlyRateId || null, deliverables: source?.deliverables, coverageIds: [...(source?.coverageIds ?? [])] }] });
      setNewTiers(current => new Set([...current, id]));
    });
  }

  function chooseLibraryItems(items: ServiceLibraryItem[], candidate = libraryPicker?.editingItem?.id || null) {
    if (libraryPicker?.optional) {
      setDraft(current => ({ ...current, addOns: [...current.addOns, ...items.filter(item => !current.addOns.some(row => row.libraryItemId === item.id || row.name.toLowerCase() === item.name.toLowerCase())).map(item => ({ id: crypto.randomUUID(), libraryItemId: item.id, deliverables: item.deliverables, name: item.name, price: ((item.priceCents ?? 0) / 100).toFixed(2), pricingType: item.pricingType, hourlyRateId: item.hourlyRateId }))].slice(0, 50) }));
      closeLibrary();
      notify("Suggested add-ons added to this draft.");
      return;
    }
    const editingId = draft.coverageItems.some(item => item.id === candidate) ? candidate : undefined;
    setDraft(current => {
      const included = items.map(({ id, ...item }) => ({ ...item, id: editingId || crypto.randomUUID(), libraryItemId: id }));
      return { ...current, coverageItems: editingId
        ? current.coverageItems.map(item => item.id === editingId ? included[0] : item)
        : [...current.coverageItems, ...included.filter(item => !current.coverageItems.some(row => row.libraryItemId === item.libraryItemId || row.name.toLowerCase() === item.name.toLowerCase()))].slice(0, 100)
      };
    });
    closeLibrary();
    notify(editingId ? "Service updated in this draft." : "Services added to this draft.");
  }

  const packagePicker = libraryTier && <ServiceLibraryPicker embedded rates={rates} onRateSaved={onRateSaved} selectedItems={draft.coverageItems}
      editingItem={libraryPicker?.editingItem} packageServices={libraryPicker?.editingItem ? undefined : libraryTier} onClose={closeLibrary}
      onChoose={(items, details) => {
        if (libraryPicker?.editingItem) { chooseLibraryItems(items, libraryPicker.editingItem.id); return; }
        if (!details) return;
        const additions = items.map(({ id, ...item }) => ({ ...item, id: crypto.randomUUID(), libraryItemId: id }));
        setDraft(current => ({
          ...current,
          coverageItems: [...current.coverageItems, ...additions],
          tiers: current.tiers.map(tier => tier.id === libraryTier.id ? {
            ...tier,
            coverageIds: [...details.coverageIds, ...additions.map(item => item.id)]
          } : tier)
        }));
        closeLibrary();
      }} />;

  return <div className={styles.editor}>
    {Object.entries(scheduling).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <input type="hidden" name="pricingType" value={firstTier?.pricingType === "TIME_FRAME" ? "FLAT_RATE" : firstTier?.pricingType ?? "FLAT_RATE"} />
    <input type="hidden" name="hourlyRateId" value={firstTier?.pricingType === "HOURLY" ? firstTier.hourlyRateId ?? "" : ""} />
    <input type="hidden" name="sessionOffering" value={JSON.stringify({ ...draft, tiers: draft.tiers.map(tier => ({ ...tier, price: tierPrice(tier) })) })} />
    <input type="hidden" name="durationMinutes" value={firstTier?.durationMinutes ?? durationMinutes} />
    <input type="hidden" name="price" value={firstTier ? tierPrice(firstTier) : ""} />
    <section className="studio-panel ui-section-card ui-table-card" aria-labelledby={`${listId}-packages-title`}>
    <div className="ui-section-header"><h2 id={`${listId}-packages-title`}>Packages</h2><Button type="button" variant="secondary" size="sm" disabled={draft.tiers.length >= 10} onClick={() => addTier()}><Plus aria-hidden="true" size={16} />Add package</Button></div>
    <ResponsiveTableFrame className={`catalog-table-scroll ${styles.servicesTable} ${styles.packagesTable}`} role="region" aria-label="Packages table" tabIndex={0}>
      <table className="catalog-product-table"><thead><tr><th scope="col">Package</th><th scope="col">Price</th><th scope="col">Duration</th><th scope="col">Actions</th></tr></thead><tbody>
        {draft.tiers.filter(tier => !newTiers.has(tier.id)).map(tier => <tr key={tier.id}>
          <td><button type="button" className={styles.packageName} aria-haspopup="dialog" onClick={() => setExpandedTiers(new Set([tier.id]))}>{tier.name}</button></td>
          <td>{tierPrice(tier) ? Number(tierPrice(tier)).toLocaleString("en-US", { style: "currency", currency: "USD" }) : "—"}</td>
          <td>{tier.pricingType === "TIME_FRAME" ? timeFrameLabel(tier) : packageDurationLabel(tier.durationMinutes)}</td>
          <td><Button type="button" variant="ghost" size="sm" aria-label={`Edit ${tier.name}`} onClick={() => setExpandedTiers(new Set([tier.id]))}><Pencil aria-hidden="true" size={15} /></Button></td>
        </tr>)}
      </tbody></table>
      {!draft.tiers.some(tier => !newTiers.has(tier.id)) && <p className={styles.servicesEmpty}>No packages added</p>}
    </ResponsiveTableFrame>
      {draft.tiers.map((tier, index) => {
        const services = draft.coverageItems.filter(item => tier.coverageIds.includes(item.id));
        const totalMinutes = Number(tier.durationMinutes);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const durationLabelId = `${listId}-duration-${tier.id}`;
        const content = (
          <div className={styles.tierBody}>
          <div className={`ui-dialog-scroll ${styles.tierFields}`}>
          <section className={styles.packageSection} aria-labelledby={`${listId}-basics-${tier.id}`}>
          <h3 className="ui-zero" id={`${listId}-basics-${tier.id}`}>Name &amp; pricing</h3>
          <Field label="Package name"><Input id={`${listId}-${tier.id}`} aria-label={`Package ${index + 1} name`} value={tier.name} autoFocus required maxLength={120} onChange={event => updateTier(tier.id, { name: event.target.value })} /></Field>
          <div className={styles.tierNumbers}>
            <ServicePricingFields allowTimeFrame pricingType={tier.pricingType ?? "FLAT_RATE"} hourlyRateId={tier.hourlyRateId ?? ""} rates={rates}
              onChange={(pricingType, hourlyRateId) => updateTier(tier.id, { pricingType, hourlyRateId: hourlyRateId || null, timeFrame: pricingType === "TIME_FRAME" ? tier.timeFrame ?? { start: "13:00", end: "15:00", endsNextDay: false } : undefined })} onRateSaved={onRateSaved}
              priceField={<Field label="Price (USD)">
                <Input aria-label={`${tier.name} price (USD)`} type="number" inputMode="decimal" min="0" max="9999999.99" step="0.01"
                  required={isNew || multi}
                  placeholder="0.00" value={tier.price} onChange={event => updateTier(tier.id, { price: event.target.value })} />
              </Field>}
            />
          </div>
          </section>
          <section className={styles.packageSection} aria-labelledby={`${listId}-coverage-${tier.id}`}>
          <h3 className="ui-zero" id={`${listId}-coverage-${tier.id}`}>Session coverage</h3>
          <p className="muted-text">Base counts below are increased by any included services and selected add-ons.</p>
          <div className={styles.deliverables}>
            {tier.pricingType === "TIME_FRAME" ? <div className={styles.timeFrame}>
              <Field label="Ends"><Select aria-label="End day" value={tier.timeFrame?.endsNextDay ? "NEXT_DAY" : "SAME_DAY"} onChange={event => updateTier(tier.id, { timeFrame: { start: tier.timeFrame?.start ?? "", end: tier.timeFrame?.end ?? "", ...tier.timeFrame, endsNextDay: event.target.value === "NEXT_DAY" } })}>
                <option value="SAME_DAY">Same Day</option><option value="NEXT_DAY">Next Day</option>
              </Select></Field>
              <Field label="Start Time"><TimeInput className="ui-input" required value={tier.timeFrame?.start ?? ""} onValueChange={start => updateTier(tier.id, { timeFrame: editTimeFrame(tier.timeFrame ?? { start: "", end: "" }, { start }) })} /></Field>
              <Field label="End Time"><TimeInput className="ui-input" required value={tier.timeFrame?.end ?? ""} onValueChange={end => updateTier(tier.id, { timeFrame: editTimeFrame(tier.timeFrame ?? { start: "", end: "" }, { end }) })} /></Field>
            </div> : <div className={styles.duration} role="group" aria-labelledby={durationLabelId}>
              <span className="ui-field-label" id={durationLabelId}>Duration</span>
              <div className={styles.durationControls}>
                <Select compact aria-label="Hours" value={hours} onChange={event => {
                  const nextHours = Number(event.target.value);
                  const nextMinutes = nextHours === maxDurationHours ? 0 : minutes;
                  updateTier(tier.id, { durationMinutes: String(nextHours * 60 + nextMinutes) });
                }}>
                  {durationHours.map(hour => <option key={hour} value={hour}>{hour} H</option>)}
                </Select>
                <Select compact aria-label="Minutes" required disabled={hours === maxDurationHours}
                  value={totalMinutes === 0 ? "" : minutes}
                  onChange={event => updateTier(tier.id, { durationMinutes: String(hours * 60 + Number(event.target.value)) })}>
                  <option value={hours === 0 ? "" : 0}>{hours === 0 ? "— M" : "0 M"}</option>
                  {durationMinutesOfHour.slice(1).map(minute => <option key={minute} value={minute}>{minute} M</option>)}
                </Select>
              </div>
            </div>}
            {deliverableFields.map(([key, label]) => (
              <Field key={key} label={label}>
                <Input type="number" inputMode="numeric" min="0" max={Number.MAX_SAFE_INTEGER} step="1"
                  value={tier.deliverables?.[key] ?? ""}
                  onChange={event => {
                    const counts = { ...tier.deliverables };
                    if (event.currentTarget.value === "") delete counts[key];
                    else counts[key] = event.currentTarget.valueAsNumber;
                    updateTier(tier.id, { deliverables: Object.keys(counts).length ? counts : undefined });
                  }} />
              </Field>
            ))}
          </div>
          </section>
          <section className={styles.packageSection} aria-labelledby={`${listId}-booking-${tier.id}`}>
          <h3 className="ui-zero" id={`${listId}-booking-${tier.id}`}>Booking settings</h3>
          <div className={styles.bookingOptions} role="group" aria-label="Booking settings">
            {([
              ["bufferBeforeMinutes", "Time Before", "min", "minutes", 0, 1440],
              ["bufferAfterMinutes", "Time After", "min", "minutes", 0, 1440],
              ["minimumNoticeHours", "Minimum Notice", "hr", "hours", 0, 8760],
              ["maxAdvanceDays", "Book Ahead", "days", "days", 1, 3650]
            ] as const).map(([key, label, unit, accessibleUnit, min, max]) => <Field key={key} label={label}>
              <span className={styles.unitField}>
                <Input aria-label={`${label} (${accessibleUnit})`} type="number" min={min} max={max} required value={scheduling[key]} onChange={event => setScheduling(current => ({ ...current, [key]: event.target.value }))} />
                <span className={styles.unit} style={{ insetInlineStart: `calc(var(--sd-space-12) + ${Math.max(1, scheduling[key].length)}ch + var(--sd-space-4))` }} aria-hidden="true">{unit}</span>
              </span>
            </Field>)}
          </div>
          </section>
          <section className={styles.tierServices} aria-labelledby={`${listId}-service-title-${tier.id}`}>
            <div className={styles.heading}>
              <h3 className="ui-zero" id={`${listId}-service-title-${tier.id}`}>Services</h3>
              <Button id={`${listId}-services-${tier.id}`} type="button" size="sm" variant="secondary" onClick={() => setLibraryPicker({ tierId: tier.id })}>
                <Plus aria-hidden="true" size={15} />Add Services
              </Button>
            </div>
            <ResponsiveTableFrame className={`catalog-table-scroll ${styles.servicesTable}`} tabIndex={0} role="region" aria-label="Package services table">
              <table className="catalog-product-table">
                <thead><tr><th scope="col">Service</th><th scope="col" className={styles.serviceActions}>Actions</th></tr></thead>
                <tbody>
                  {services.map(item => <tr key={item.id}><td>{item.name}</td><td className={styles.serviceActions}><Button id={`${listId}-edit-${tier.id}-${item.id}`} type="button" variant="secondary" size="sm" aria-label={`Edit ${item.name}`} onClick={() => setLibraryPicker({ tierId: tier.id, editingItem: item })}><Pencil aria-hidden="true" size={15} /></Button><Button type="button" variant="ghost" size="sm" aria-label={`Remove ${item.name} from ${tier.name}`} onClick={() => updateTier(tier.id, { coverageIds: tier.coverageIds.filter(id => id !== item.id) })}><X aria-hidden="true" size={15} /></Button></td></tr>)}
                </tbody>
              </table>
              {!services.length && <p className={styles.servicesEmpty}>No services added</p>}
            </ResponsiveTableFrame>
          </section>
          </div>
          <div className={`ui-inline-actions ${styles.actions}`}>
            {newTiers.has(tier.id)
              ? <Button type="button" variant="ghost" disabled={!canDiscardTier} onClick={() => discardTier(tier.id)}>Cancel</Button>
              : <Button type="button" variant="danger" disabled={!canDiscardTier} onClick={() => setRemoval({ kind: "package", id: tier.id, name: tier.name })}>Remove</Button>}
            {!newTiers.has(tier.id) && <Button type="button" variant="secondary" disabled={draft.tiers.length >= 10} onClick={() => addTier(tier)}><Copy size={15} />Duplicate</Button>}
            <Button type="button" onClick={event => {
            const fields = event.currentTarget.closest(`.${styles.tierBody}`)?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select");
            if (fields && [...fields].some(field => !field.reportValidity())) return;
            if (draft.tiers.some(item => item.id !== tier.id && item.name.trim().toLowerCase() === tier.name.trim().toLowerCase())) { notify("Use a different name for each package.", "danger"); return; }
            setExpandedTiers(new Set()); setNewTiers(current => new Set([...current].filter(id => id !== tier.id)));
          }}>Done</Button></div>
        </div>
        );
        const isNewTier = newTiers.has(tier.id);
        return (isNewTier || expandedTiers.has(tier.id)) ? <Modal key={tier.id} open title={libraryPicker?.tierId === tier.id ? libraryPicker.editingItem ? "Edit service" : "Add Services" : isNewTier ? "New package" : `Edit ${tier.name || "package"}`} className={styles.packageModal} bodyClassName={styles.packageModalBody}
          onClose={() => libraryPicker?.tierId === tier.id ? closeLibrary() : isNewTier ? discardTier(tier.id) : setExpandedTiers(new Set())}>
          {libraryPicker?.tierId === tier.id ? packagePicker : content}
        </Modal> : null;
      })}
    </section>
    <section className="studio-panel ui-section-card ui-table-card" aria-labelledby={`${listId}-optional-title`}>
      <div className="ui-section-header">
        <h2 id={`${listId}-optional-title`} tabIndex={-1}>Suggested Add-Ons</h2>
        <Button type="button" variant="secondary" size="sm" disabled={draft.addOns.length >= 50} onClick={() => { setLibraryPicker({ optional: true }); }}><Plus size={16} />Add add-on</Button>
      </div>
      <ResponsiveTableFrame className={`catalog-table-scroll ${styles.servicesTable} ${styles.suggestionsTable}`} tabIndex={0} role="region" aria-label="Suggested add-ons table">
        <table className="catalog-product-table"><thead><tr><th scope="col">Service</th><th scope="col">Add-on price</th><th scope="col">Actions</th></tr></thead><tbody>
          {draft.addOns.map((item, index) => <tr key={item.id}>
            <td>{item.name || `Add-on ${index + 1}`}</td>
            <td>{item.pricingType === "HOURLY" ? `${((rates.find(rate => rate.id === item.hourlyRateId)?.amountCents ?? 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} / hour` : Number(item.price).toLocaleString("en-US", { style: "currency", currency: "USD" })}{item.pricingType === "PER_UNIT" ? " / unit" : ""}</td>
            <td><Button type="button" variant="ghost" size="sm" aria-label={`Remove add-on ${item.name || index + 1}`} onClick={() => setRemoval({ kind: "extra", id: item.id, name: item.name || `Add-on ${index + 1}` })}><X aria-hidden="true" size={16} /></Button></td>
          </tr>)}
        </tbody></table>
        {!draft.addOns.length && <p className={styles.servicesEmpty}>No suggested add-ons</p>}
      </ResponsiveTableFrame>
    </section>
    {libraryPicker && !libraryPicker.tierId && <ServiceLibraryPicker optional={libraryPicker.optional} rates={rates} onRateSaved={onRateSaved} selectedItems={libraryPicker.optional ? draft.addOns : draft.coverageItems} editingItem={libraryPicker.editingItem} onChoose={items => chooseLibraryItems(items)} onClose={closeLibrary} />}
    {removal && <Modal open title={`Remove "${removal.name}"?`} onClose={() => setRemoval(null)}>
      <p>{removal.kind === "package" ? "This removes the package and its selections. Your included services stay in this session and the library." : "This removes the optional extra from this session."}</p>
      <div className="module-modal-actions"><Button type="button" variant="secondary" autoFocus onClick={() => setRemoval(null)}>Cancel</Button><Button type="button" variant="danger" onClick={() => {
        if (removal.kind === "package") discardTier(removal.id);
        else setDraft(current => ({ ...current, addOns: current.addOns.filter(item => item.id !== removal.id) }));
        setRemoval(null); notify(`${removal.name} removed from this draft.`);
      }}>Remove {removal.kind}</Button></div>
    </Modal>}
  </div>;
}
