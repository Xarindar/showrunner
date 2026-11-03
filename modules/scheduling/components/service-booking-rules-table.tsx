"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { useNotify } from "@/components/ui/notifications";
import { bookingRuleSchema, bookingRulesSchema, defaultBookingRules, readBookingRules, type BookingRule, type BookingRuleSet } from "@/lib/scheduling/booking-rules";
import { listBookingRuleSets, saveBookingRuleSet } from "../booking-rule-actions";

type Props = { defaultRules?: unknown; defaultIntakePrompt?: string | null; defaultPolicyText?: string | null; defaultRequirePolicy?: boolean; defaultRequestOnly?: boolean; defaultWaitlistEnabled?: boolean; idPrefix: string; intakeOptions?: string[]; policyOptions?: string[]; availableRules?: BookingRule[] };
const typeLabels = { TEXT: "Text box", RADIO: "Radio buttons", SELECT: "Dropdown" };

export function ServiceBookingRulesTable({ defaultRules, defaultIntakePrompt, defaultPolicyText, defaultRequirePolicy = false, defaultRequestOnly = false, defaultWaitlistEnabled = false, idPrefix, intakeOptions = [], policyOptions = [], availableRules = [] }: Props) {
  const [rules, setRules] = useState(() => readBookingRules(defaultRules, { intakePrompt: defaultIntakePrompt, policyText: defaultPolicyText }));
  const [requirePolicy, setRequirePolicy] = useState(defaultRequirePolicy);
  const [requestOnly, setRequestOnly] = useState(defaultRequestOnly);
  const [waitlistEnabled, setWaitlistEnabled] = useState(defaultWaitlistEnabled);
  const [mode, setMode] = useState<"library" | "edit" | "save-set" | null>(null);
  const [draft, setDraft] = useState<BookingRule | null>(null);
  const [choices, setChoices] = useState("");
  const [search, setSearch] = useState("");
  const [setName, setSetName] = useState("");
  const [sets, setSets] = useState<BookingRuleSet[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [setsError, setSetsError] = useState("");
  const modalBody = useRef<HTMLDivElement>(null);
  const notify = useNotify();
  const policyText = rules.filter(rule => rule.kind === "policy").map(rule => rule.label).join("\n\n");
  const intakePrompt = rules.filter(rule => rule.kind === "intake" && !rule.contactField).map(rule => rule.label).join("\n");
  const legacyOptions = [...intakeOptions.map(label => ({ kind: "intake" as const, label })), ...policyOptions.map(label => ({ kind: "policy" as const, label }))].map((rule, index): BookingRule => ({ ...rule, id: `suggestion-${index}`, category: rule.kind === "policy" ? "Booking Terms & Conditions" : "General", type: "TEXT", required: false, options: [], placeholder: "", helpText: "" }));
  const library = [...defaultBookingRules, ...availableRules, ...legacyOptions].filter((rule, index, all) => all.findIndex(other => (rule.contactField && other.contactField === rule.contactField) || (other.kind === rule.kind && other.label.toLowerCase() === rule.label.toLowerCase())) === index);
  const categories = [...new Set(library.map(rule => rule.category))];
  const alreadyAdded = (rule: BookingRule) => rules.some(saved => (rule.contactField && saved.contactField === rule.contactField) || (saved.kind === rule.kind && saved.label.toLowerCase() === rule.label.toLowerCase()));

  useEffect(() => {
    modalBody.current?.parentElement?.scrollTo(0, 0);
    if (mode !== "library") return;
    let active = true;
    listBookingRuleSets().then(result => { if (active) { setSets(result); setSetsError(""); } }).catch(() => { if (active) setSetsError("Saved sets could not be loaded. Close and reopen to retry."); });
    return () => { active = false; };
  }, [mode]);
  function open(mode: "library" | "save-set") { setError(""); setSearch(""); setMode(mode); }
  function edit(rule?: BookingRule) {
    const value: BookingRule = rule ?? { id: crypto.randomUUID(), kind: "intake", category: "General", label: "", type: "TEXT", required: false, placeholder: "", helpText: "", options: [] };
    setDraft(value); setChoices(value.options.join("\n")); setError(""); setMode("edit");
  }
  function add(incoming: BookingRule[]) {
    const parsed = bookingRulesSchema.safeParse([...rules, ...incoming.filter(rule => !alreadyAdded(rule)).map(rule => ({ ...rule, id: rule.contactField ? rule.id : crypto.randomUUID() }))]);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setRules(parsed.data); setMode(null); notify("Rules added to this draft. Save the session type to keep them.");
  }
  function saveRule() {
    const parsed = bookingRuleSchema.safeParse({ ...draft, options: draft?.type === "TEXT" ? [] : choices.split(/\r?\n/).map(value => value.trim()).filter(Boolean) });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    const next = bookingRulesSchema.safeParse(rules.some(rule => rule.id === parsed.data.id) ? rules.map(rule => rule.id === parsed.data.id ? parsed.data : rule) : [...rules, parsed.data]);
    if (!next.success) { setError(next.error.issues[0].message); return; }
    setRules(next.data); setMode(null);
  }
  async function saveSet() {
    setPending(true); setError("");
    try {
      const result = await saveBookingRuleSet({ name: setName, rules });
      if (result.error) { setError(result.error); return; }
      if (result.set) { setSets(current => [...current, result.set!]); setSetName(""); setMode(null); notify("Rule set saved. Apply it from Add rule on another service."); }
    } catch { setError("The rule set could not be saved. Your rules are still here; please try again."); }
    finally { setPending(false); }
  }
  return <div className="service-booking-rules" id={`${idPrefix}-booking-rules`}>
    <input name="bookingRules" type="hidden" value={JSON.stringify(rules)} />
    <input name="intakePrompt" type="hidden" value={intakePrompt} /><input name="policyText" type="hidden" value={policyText} />
    <div className="booking-rules-toolbar"><Button type="button" onClick={() => open("library")}><Plus size={15} />Add rule</Button><Button type="button" variant="secondary" disabled={!rules.length} onClick={() => open("save-set")}>Save as set</Button></div>
    <div className="booking-rules-list" role={rules.length ? "list" : "region"} aria-label="Selected booking rules">
      {rules.map(rule => <div className="booking-rule-row" key={rule.id} role="listitem">
        <div className="booking-rule-type-cell"><span><strong>{rule.kind === "policy" ? "Booking Terms & Conditions" : rule.label}</strong><small>{rule.kind === "policy" ? (rule.category === "Booking Terms & Conditions" ? "Booking T&C" : rule.category) : `${rule.category} · ${typeLabels[rule.type]}`}{rule.required ? " · Required" : ""}</small></span></div>
        <span className="booking-rule-copy">{rule.kind === "policy" ? rule.label : rule.helpText || (rule.type === "TEXT" ? rule.placeholder : rule.options.join(" · "))}</span>
        <span className="catalog-status">{rule.kind === "policy" && requirePolicy ? "Acceptance required" : "Shown at booking"}</span>
        <div className="booking-rule-actions"><Button type="button" variant="ghost" className="booking-rule-icon-button" aria-label={`Edit ${rule.label}`} onClick={() => edit(rule)}><Pencil size={15} /></Button><Button type="button" variant="ghost" className="booking-rule-icon-button" aria-label={`Remove ${rule.kind === "policy" ? "Booking T&C" : "intake question"}: ${rule.label}`} onClick={() => { const next = rules.filter(saved => saved.id !== rule.id); setRules(next); if (!next.some(saved => saved.kind === "policy")) setRequirePolicy(false); }}><Trash2 size={15} /></Button></div>
      </div>)}
      {!rules.length && <div className="booking-rules-empty">No intake question or Booking Terms & Conditions added</div>}
    </div>
    <div className="studio-toggle-strip booking-rules-toggle-strip"><Switch checked={Boolean(requirePolicy && policyText)} disabled={!policyText} label="Require Booking T&C" name="requirePolicy" onChange={event => setRequirePolicy(event.currentTarget.checked)} variant="inline" /><Switch checked={requestOnly} label="Require Booking Approval" name="requestOnly" onChange={event => setRequestOnly(event.currentTarget.checked)} variant="inline" /><Switch checked={waitlistEnabled} label="Offer waitlist" name="waitlistEnabled" onChange={event => setWaitlistEnabled(event.currentTarget.checked)} variant="inline" /></div>
    <Modal open={mode !== null} title={mode === "library" ? "Add booking rule" : mode === "save-set" ? "Save rule set" : "Configure booking rule"} className="booking-rule-modal" bodyClassName="booking-rule-modal-body" onClose={() => { if (!pending) setMode(null); }}>
      <div ref={modalBody} className="booking-rule-modal-body" onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); if (mode === "save-set" && !pending) void saveSet(); } }}>
      {mode === "library" && <>
        <Field label="Search rules"><Input type="search" value={search} onChange={event => setSearch(event.target.value)} /></Field>
        {sets.length > 0 && <section className="booking-rule-category"><h3>Saved rule sets</h3>{sets.filter(set => set.name.toLowerCase().includes(search.toLowerCase())).map(set => <div className="booking-rule-set" key={set.id}><span><strong>{set.name}</strong><small>{set.rules.length} rules</small></span><Button type="button" variant="secondary" onClick={() => add(set.rules)}>Apply {set.name}</Button></div>)}</section>}
        {setsError && <p role="alert">{setsError}</p>}
        {categories.map(category => {
          const categoryRules = library.filter(rule => rule.category === category);
          const entries = categoryRules.filter(rule => `${category} ${rule.label}`.toLowerCase().includes(search.toLowerCase()));
          if (!entries.length) return null;
          return <section className="booking-rule-category" key={category}><header><h3>{category}</h3><Button type="button" variant="secondary" disabled={categoryRules.every(alreadyAdded)} onClick={() => add(categoryRules)}>Add all {category === "Booking Terms & Conditions" ? "Booking T&C" : category}</Button></header><div className="booking-rule-option-list">{entries.map(rule => <Button type="button" variant="ghost" className="booking-rule-option" key={rule.id} disabled={alreadyAdded(rule)} onClick={() => add([rule])}><strong>{rule.label}</strong><span>{rule.kind === "policy" ? "Booking Terms & Conditions" : typeLabels[rule.type]}{alreadyAdded(rule) ? " · Added" : ""}</span></Button>)}</div></section>;
        })}
        <div className="module-modal-actions"><Button type="button" variant="ghost" onClick={() => setMode(null)}>Cancel</Button><Button type="button" onClick={() => edit()}>Create rule</Button></div>
      </>}
      {mode === "edit" && draft && <>
        <Field label="Rule kind"><Select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as BookingRule["kind"], type: "TEXT", contactField: undefined })}><option value="intake">Intake question</option><option value="policy">Booking Terms &amp; Conditions</option></Select></Field>
        <Field label="Category"><Input value={draft.category} maxLength={80} onChange={event => setDraft({ ...draft, category: event.target.value })} /></Field>
        <Field label={draft.kind === "policy" ? "Booking Terms & Conditions" : "Question"}>{draft.kind === "policy" ? <Textarea value={draft.label} maxLength={2000} onChange={event => setDraft({ ...draft, label: event.target.value })} /> : <Input value={draft.label} maxLength={2000} onChange={event => setDraft({ ...draft, label: event.target.value })} />}</Field>
        {draft.kind === "intake" && <>
          <Field label="Answer type"><Select disabled={Boolean(draft.contactField)} value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value as BookingRule["type"] })}>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field>
          {draft.contactField && <p className="ui-field-hint">Uses the existing booking contact field, without asking the client twice.</p>}
          {draft.type !== "TEXT" ? <Field label="Choices" hint="One choice per line; at least two different choices."><Textarea value={choices} onChange={event => setChoices(event.target.value)} /></Field> : <Field label="Placeholder"><Input value={draft.placeholder} maxLength={200} onChange={event => setDraft({ ...draft, placeholder: event.target.value })} /></Field>}
          <Field label="Help text"><Input value={draft.helpText} maxLength={500} onChange={event => setDraft({ ...draft, helpText: event.target.value })} /></Field>
          <Switch label="Required answer" disabled={draft.contactField === "customerName" || draft.contactField === "customerEmail"} checked={draft.contactField === "customerName" || draft.contactField === "customerEmail" || draft.required} onChange={event => setDraft({ ...draft, required: event.target.checked })} />
        </>}
        <div className="module-modal-actions"><Button type="button" variant="ghost" onClick={() => setMode(null)}>Cancel</Button><Button type="button" onClick={saveRule}>Apply rule</Button></div>
      </>}
      {mode === "save-set" && <><p>Save these {rules.length} rules for reuse on other services. Applying a set adds copies to that service’s draft.</p><Field label="Set name"><Input value={setName} maxLength={100} disabled={pending} onChange={event => setSetName(event.target.value)} /></Field><div className="module-modal-actions"><Button type="button" variant="ghost" disabled={pending} onClick={() => setMode(null)}>Cancel</Button><Button type="button" disabled={pending} onClick={saveSet}>{pending ? "Saving…" : "Save set"}</Button></div></>}
      {error && <p role="alert">{error}</p>}
      </div>
    </Modal>
  </div>;
}
