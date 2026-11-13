"use client";

import { useEffect, useId, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Modal } from "@/components/ui/modal";
import { isServiceAddOn, serviceLibraryInputSchema, type ServiceLibraryItem, type ServiceLibraryResults } from "@/lib/scheduling/service-library";
import type { SessionOffering } from "@/lib/scheduling/session-offering";
import { saveServiceLibraryItemAction } from "../service-library-actions";
import styles from "./service-library-picker.module.css";
import type { HourlyRate, AddOnPricingType } from "@/lib/scheduling/pricing";
import { ServicePricingFields } from "./service-pricing-fields";
import { useNotify } from "@/components/ui/notifications";

type IncludedItem = SessionOffering["coverageItems"][number];
type PackageServices = Pick<SessionOffering["tiers"][number], "coverageIds">;

export function ServiceLibraryPicker({ selectedItems, editingItem, onChoose, onClose, embedded = false, rates, onRateSaved, optional = false, packageServices }: {
  rates: HourlyRate[]; onRateSaved: (rate: HourlyRate) => void;
  embedded?: boolean;
  optional?: boolean;
  selectedItems: IncludedItem[];
  editingItem?: IncludedItem;
  packageServices?: PackageServices;
  onChoose: (items: ServiceLibraryItem[], details?: PackageServices) => void;
  onClose: () => void;
}) {
  const id = useId();
  const notify = useNotify();
  const [view, setView] = useState<"library" | "edit">(editingItem ? "edit" : "library");
  const [form, setForm] = useState({ id: editingItem?.libraryItemId, name: editingItem?.name || "", description: editingItem?.description || "", category: editingItem?.category || "", tags: editingItem?.tags?.join(", ") || "", pricingType: (editingItem?.pricingType ?? "FLAT_RATE") as AddOnPricingType, hourlyRateId: editingItem?.hourlyRateId ?? "", price: editingItem?.priceCents == null ? "" : (editingItem.priceCents / 100).toFixed(2) });
  const [deliverableChanges, setDeliverableChanges] = useState(editingItem?.deliverables || {});
  const [availableAsAddOn, setAvailableAsAddOn] = useState(isServiceAddOn(editingItem ?? {}));
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<ServiceLibraryResults>({ items: [], categories: [], tags: [], total: 0, page: 1, pageCount: 1 });
  const [picked, setPicked] = useState<ServiceLibraryItem[]>([]);
  const [coverageIds, setCoverageIds] = useState(packageServices?.coverageIds ?? []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const remaining = (optional ? 50 : 100) - selectedItems.length;

  useEffect(() => {
    document.getElementById(`${id}-${view === "library" ? "search" : "name"}`)?.focus();
  }, [id, view]);

  useEffect(() => {
    if (view !== "library") return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ q, category, tag, page: String(page), ...(optional ? { addOnsOnly: "true" } : {}) });
        const response = await fetch(`/api/scheduling/service-library?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Library unavailable");
        const data: ServiceLibraryResults = await response.json();
        if (!controller.signal.aborted) setResults(data);
      } catch {
        if (!controller.signal.aborted) setError("The service library could not be loaded. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, category, tag, page, view, reload, optional]);

  function changeFilter(setValue: (value: string) => void, value: string) {
    setValue(value);
    setPage(1);
    setLoading(true);
  }

  async function save() {
    const parsed = serviceLibraryInputSchema.safeParse({ ...form, deliverables: deliverableChanges, availableAsAddOn });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      document.getElementById(`${id}-${String(parsed.error.issues[0].path[0])}`)?.focus();
      return;
    }
    if (optional && !isServiceAddOn(parsed.data)) { setError("Enable Available as an add-on and set its price before adding it to Suggested Add-Ons."); return; }
    setSaving(true);
    setError("");
    try {
      const result = await saveServiceLibraryItemAction({ ...form, deliverables: deliverableChanges, availableAsAddOn });
      if (result.error) { notify(result.error, "danger"); return; }
      if (result.item) {
        const selection = [...picked.filter(item => item.id !== result.item.id), result.item];
        if (packageServices) {
          setPicked(selection);
          setReload(value => value + 1);
          setView("library");
        } else onChoose(selection);
      }
    } catch {
      notify("The service could not be saved. Your details are still here; please try again.", "danger");
    } finally { setSaving(false); }
  }

  function applySelection() {
    onChoose(picked, packageServices ? { coverageIds } : undefined);
  }

  const content = <>
    {view === "library" ? <>
      <div className={styles.toolbar}>
        <Field label="Search services"><Input id={`${id}-search`} type="search" value={q} maxLength={120} placeholder="Name, description or tag" onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} onChange={event => changeFilter(setQ, event.target.value)} /></Field>
        <Button type="button" variant="secondary" disabled={picked.length >= remaining} onClick={() => { setForm({ id: undefined, name: q.trim(), description: "", category: "", tags: "", pricingType: "FLAT_RATE", hourlyRateId: "", price: "" }); setAvailableAsAddOn(optional); setError(""); setView("edit"); }}><Plus size={16} />New service</Button>
      </div>
      <div className={styles.filters}>
        <Field label="Category"><Select value={category} onChange={event => changeFilter(setCategory, event.target.value)}><option value="">All categories</option>{results.categories.map(value => <option key={value}>{value}</option>)}</Select></Field>
        <Field label="Tag"><Select value={tag} onChange={event => changeFilter(setTag, event.target.value)}><option value="">All tags</option>{results.tags.map(value => <option key={value}>{value}</option>)}</Select></Field>
      </div>
      <div className={`ui-dialog-scroll ${styles.results}`} aria-busy={loading} aria-label="Library services">
        {packageServices && selectedItems.length > 0 && <fieldset className={styles.sessionServices}>
            <legend>Services in this session</legend>
            {selectedItems.map(item => (
              <label key={item.id} className={styles.option}>
                <input type="checkbox" checked={coverageIds.includes(item.id)}
                  onChange={event => setCoverageIds(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} />
                <span className={styles.serviceCopy}><strong>{item.name}</strong></span>
              </label>
            ))}
        </fieldset>}
        <p className={styles.hint} role="status">{loading ? "Loading services…" : error ? "" : `${results.total} ${results.total === 1 ? "service" : "services"}`}</p>
        {error ? <div className={styles.error} role="alert"><p>{error}</p><Button type="button" variant="secondary" onClick={() => { setLoading(true); setReload(value => value + 1); }}>Try again</Button></div> : null}
        {!error && <>
          {results.items.length === 0 ? !loading && <div className={styles.empty}>
            <h3>{q || category || tag ? "No matching services" : "Your service library is empty"}</h3>
            <p>{q || category || tag ? "Try another search or clear the filters." : "Create your first reusable service with a name and description."}</p>
            {(q || category || tag) && <Button type="button" variant="ghost" onClick={() => { setQ(""); setCategory(""); setTag(""); setPage(1); setLoading(true); }}>Clear filters</Button>}
          </div> : results.items.map(item => {
            const unavailable = optional && !isServiceAddOn(item);
            const added = selectedItems.some(selected => selected.libraryItemId === item.id || selected.name.toLowerCase() === item.name.toLowerCase());
            const checked = picked.some(selected => selected.id === item.id);
            return <label key={item.id} className={styles.option} data-added={added}>
              <input type="checkbox" aria-label={`Select ${item.name}`} checked={added || checked} disabled={loading || added || unavailable || (!checked && picked.length >= remaining)} onChange={event => setPicked(current => event.target.checked ? [...current, item] : current.filter(selected => selected.id !== item.id))} />
              <span className={styles.serviceCopy}><strong>{item.name}</strong><span className={styles.description}>{item.description || "No description yet"}</span>
                {(item.category || item.tags.length > 0) && <span className={styles.metadata}>{[item.category, ...item.tags.map(value => `#${value}`)].filter(Boolean).join(" · ")}</span>}
              </span>
              {added ? <span className={styles.hint}>Added</span> : unavailable ? <span className={styles.hint}>Included only</span> : optional && <span className={styles.hint}>{item.pricingType === "HOURLY" ? `${rates.find(rate => rate.id === item.hourlyRateId)?.name || "Hourly rate"} / hour` : (item.priceCents! / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}{item.pricingType === "PER_UNIT" ? " / unit" : ""}</span>}
            </label>;
          })}
          {results.pageCount > 1 && <div className={styles.pagination}>
            <Button type="button" variant="ghost" disabled={loading || page <= 1} onClick={() => { setPage(value => value - 1); setLoading(true); }}>Previous</Button>
            <span className={styles.hint}>Page {results.page} of {results.pageCount}</span>
            <Button type="button" variant="ghost" disabled={loading || page >= results.pageCount} onClick={() => { setPage(value => value + 1); setLoading(true); }}>Next</Button>
          </div>}
        </>}
      </div>
      <footer className={styles.footer}><span className={styles.hint}>{picked.length + coverageIds.length} selected</span><div className="module-modal-actions">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={!packageServices && !picked.length} onClick={applySelection}>{packageServices ? "Apply to package" : `Add ${picked.length || "selected"} ${picked.length === 1 ? "service" : "services"}`}</Button>
      </div></footer>
    </> : <>
      <div className={`ui-dialog-scroll ${styles.editBody}`} onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); if (!saving) void save(); } }}>
        {!editingItem && <Button type="button" variant="ghost" className={styles.back} disabled={saving} onClick={() => { setError(""); setView("library"); }}><ArrowLeft size={16} />Service library</Button>}
        <p className={styles.hint}>Save a reusable service. Its description can be used in client-facing session and package details.</p>
        <Field label="Service name"><Input id={`${id}-name`} value={form.name} required maxLength={120} disabled={saving} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label="Description" hint="Describe what the client receives. Avoid private or internal notes."><Textarea id={`${id}-description`} value={form.description} maxLength={2000} rows={4} disabled={saving} onChange={event => setForm({ ...form, description: event.target.value })} /></Field>
        <Switch label="Available as an add-on" description="Charge only when added separately. Including this service in a package doesn't change its price." variant="inline" checked={availableAsAddOn} disabled={saving} onChange={event => setAvailableAsAddOn(event.target.checked)} />
        {availableAsAddOn && <div className={styles.addOnPricing}>
          <ServicePricingFields allowPerUnit pricingType={form.pricingType} hourlyRateId={form.hourlyRateId} rates={rates} onRateSaved={onRateSaved} onChange={(pricingType, hourlyRateId) => setForm({ ...form, pricingType, hourlyRateId })}
            priceField={<Field label={form.pricingType === "PER_UNIT" ? "Price per unit (USD)" : "Add-on price (USD)"}><Input id={`${id}-price`} required type="number" min="0" max="9999999.99" step="0.01" inputMode="decimal" value={form.price} disabled={saving} onChange={event => setForm({ ...form, price: event.target.value })} /></Field>} />
        </div>}
        <details>
          <summary>Adds to the session</summary>
          <p className={styles.hint}>Add these amounts when this service is included or selected. Per-unit add-ons multiply them by the chosen quantity.</p>
          {([ ["finalPhotos", "Additional photos"], ["locations", "Additional locations"], ["outfitChanges", "Additional outfit changes"] ] as const).map(([key, label]) => <Field key={key} label={label}><Input type="number" min={0} max={10000} step={1} disabled={saving} value={deliverableChanges[key] ?? ""} onChange={event => setDeliverableChanges({ ...deliverableChanges, [key]: event.target.value === "" ? undefined : Number(event.target.value) })} /></Field>)}
        </details>
        <Field label="Category" hint="For example, Weddings or Portraits."><Input id={`${id}-category`} value={form.category} maxLength={120} disabled={saving} onChange={event => setForm({ ...form, category: event.target.value })} /></Field>
        <Field label="Tags" hint="Separate tags with commas."><Input id={`${id}-tags`} value={form.tags} maxLength={1500} disabled={saving} onChange={event => setForm({ ...form, tags: event.target.value })} /></Field>
        {error && <p id={`${id}-error`} tabIndex={-1} role="alert" className={styles.error}>{error}</p>}
      </div>
      <footer className={styles.footer}><span className={styles.hint}>Library changes are saved immediately.</span><div className="module-modal-actions">
        <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button type="button" disabled={saving} onClick={save}>{saving ? "Saving…" : editingItem?.name ? "Save changes" : "Create and add"}</Button>
      </div></footer>
    </>}
  </>;
  if (embedded) return <div className={`${styles.modal} ${styles.embedded}`} role="region" aria-label="Package service selection">{content}</div>;

  return <Modal open title={view === "library" ? (packageServices ? "Add Services" : "Service library") : editingItem?.name ? "Edit service" : "New service"}
    className={styles.modal} bodyClassName={styles.body} onClose={() => { if (!saving) onClose(); }}>{content}</Modal>;
}
