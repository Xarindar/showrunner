"use client";

import { ResponsiveTableFrame } from "@/components/ui/responsive-table";
import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { BookingQuestionChoices } from "@/modules/scheduling/components/booking-question-choices";
import { Switch } from "@/components/ui/switch";
import { useNotify } from "@/components/ui/notifications";
import { bookingRuleSchema, bookingRulesSchema, readBookingRules, type BookingRule, type BookingRuleSet } from "@/lib/scheduling/booking-rules";
import { bookingDocumentSelectionSchema, type BookingDocument } from "@/lib/scheduling/booking-documents";
import { listBookingRuleSets, saveBookingRuleSet } from "../booking-rule-actions";

type Props = { documents?: BookingDocument[]; initialSelection?: unknown; defaultRules?: unknown; defaultIntakePrompt?: string | null; defaultPolicyText?: string | null; defaultRequirePolicy?: boolean; defaultRequestOnly?: boolean; defaultWaitlistEnabled?: boolean; idPrefix: string; intakeOptions?: string[]; policyOptions?: string[]; availableRules?: BookingRule[] };
const typeLabels = { TEXT: "Text box", RADIO: "Radio buttons", SELECT: "Dropdown", CHECKBOX: "Checkboxes", DATE: "Date" };

export function ServiceBookingRulesTable({ documents = [], initialSelection, defaultRules, defaultIntakePrompt, defaultPolicyText, defaultRequirePolicy = false, defaultRequestOnly = false, defaultWaitlistEnabled = false, idPrefix, intakeOptions = [], policyOptions = [], availableRules = [] }: Props) {
  const [rules, setRules] = useState(() => readBookingRules(defaultRules, { intakePrompt: defaultIntakePrompt, policyText: defaultPolicyText }));
  const [selection,setSelection]=useState(()=>bookingDocumentSelectionSchema.parse(initialSelection ?? {}));
  const selectedDocuments=(["INTAKE","TERMS"] as const).flatMap(kind=>{
    const value=selection[kind==="INTAKE"?"intake":"terms"];
    const document=value==="none"?undefined:documents.find(item=>item.kind===kind&&(value==="default"?item.isDefault:item.id===value));
    return document?[document]:[];
  });
  const documentRules=selectedDocuments.flatMap(document=>document.rules.filter(rule=>!rule.contactField).map(rule=>({document,rule})));
  const requiresDocumentPolicy=documentRules.some(({rule})=>rule.kind==="policy");
  const [requirePolicy, setRequirePolicy] = useState(defaultRequirePolicy);
  const [requestOnly, setRequestOnly] = useState(defaultRequestOnly);
  const [waitlistEnabled, setWaitlistEnabled] = useState(defaultWaitlistEnabled);
  const [mode, setMode] = useState<"library" | "edit" | "save-set" | null>(null);
  const [draft, setDraft] = useState<BookingRule | null>(null);
  const [choices, setChoices] = useState<string[]>([""]);
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
  const library = [...availableRules, ...legacyOptions].filter(rule => !rule.contactField).filter((rule, index, all) => all.findIndex(other => (rule.contactField && other.contactField === rule.contactField) || (other.kind === rule.kind && other.label.toLowerCase() === rule.label.toLowerCase())) === index);
  const categories = [...new Set(library.map(rule => rule.category))];
  const alreadyAdded = (rule: BookingRule) => rules.some(saved => (rule.contactField && saved.contactField === rule.contactField) || (saved.kind === rule.kind && saved.label.toLowerCase() === rule.label.toLowerCase()));

  useEffect(() => {
    modalBody.current?.parentElement?.scrollTo(0, 0);
    if (mode !== "library") return;
    let active = true;
    listBookingRuleSets().then(result => { if (active) { setSets(result.map(set => ({ ...set, rules: set.rules.filter(rule => !rule.contactField) })).filter(set => set.rules.length > 0)); setSetsError(""); } }).catch(() => { if (active) setSetsError("Saved sets could not be loaded. Close and reopen to retry."); });
    return () => { active = false; };
  }, [mode]);
  function open(mode: "library" | "save-set") { setError(""); setSearch(""); setMode(mode); }
  function edit(rule?: BookingRule) {
    const value: BookingRule = rule ?? { id: crypto.randomUUID(), kind: "intake", category: "General", label: "", type: "TEXT", required: false, placeholder: "", helpText: "", options: [] };
    setDraft(value); setChoices(value.options.length ? [...value.options] : [""]); setError(""); setMode("edit");
  }
  function add(incoming: BookingRule[]) {
    const parsed = bookingRulesSchema.safeParse([...rules, ...incoming.filter(rule => !rule.contactField && !alreadyAdded(rule)).map(rule => ({ ...rule, id: rule.contactField ? rule.id : crypto.randomUUID() }))]);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setRules(parsed.data); setMode(null); notify("Rules added to this draft. Save the session to keep them.");
  }
  function saveRule() {
    const parsed = bookingRuleSchema.safeParse({ ...draft, options: draft && ["RADIO", "SELECT", "CHECKBOX"].includes(draft.type) ? choices.map(value => value.trim()).filter(Boolean) : [] });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    const next = bookingRulesSchema.safeParse(rules.some(rule => rule.id === parsed.data.id) ? rules.map(rule => rule.id === parsed.data.id ? parsed.data : rule) : [...rules, parsed.data]);
    if (!next.success) { setError(next.error.issues[0].message); return; }
    setRules(next.data); setMode(null);
  }
  async function saveSet() {
    setPending(true); setError("");
    try {
      const result = await saveBookingRuleSet({ name: setName, rules: rules.filter(rule => !rule.contactField) });
      if (result.error) { setError(result.error); return; }
      if (result.set) { setSets(current => [...current, result.set!]); setSetName(""); setMode(null); notify("Rule set saved. Apply it from Add rule on another service."); }
    } catch { setError("The rule set could not be saved. Your rules are still here; please try again."); }
    finally { setPending(false); }
  }
  return <section className="studio-panel ui-section-card ui-table-card service-booking-rules" id={`${idPrefix}-booking-rules`} aria-labelledby={`${idPrefix}-rules-title`}>
    <input name="bookingDocumentSelection" type="hidden" value={JSON.stringify(selection)} />
    {requiresDocumentPolicy&&requirePolicy&&<input name="requirePolicy" type="hidden" value="on"/>}
    <input name="bookingRules" type="hidden" value={JSON.stringify(rules)} />
    <input name="intakePrompt" type="hidden" value={intakePrompt} /><input name="policyText" type="hidden" value={policyText} />
    <div className="ui-section-header">
      <h2 id={`${idPrefix}-rules-title`}>Intake and Booking Terms &amp; Conditions</h2>
      <div className="booking-rule-actions">
        <ButtonLink href="/admin/modules/appointments/forms-terms" variant="secondary">Manage forms &amp; terms</ButtonLink>
        <Button type="button" variant="secondary" onClick={() => open("library")}><Plus size={15} />Add rule</Button>
      </div>
    </div>
    <div className="ui-section-body booking-document-choices">
      {([["intake","INTAKE","Intake form"],["terms","TERMS","Booking terms"]] as const).map(([key,kind,label])=>{
        const global=documents.find(document=>document.kind===kind&&document.isDefault);
        return <Field key={key} label={label}>
          <Select aria-label={label} value={selection[key]} onChange={event=>setSelection({...selection,[key]:event.target.value})}>
            <option value="default">Use global default{global?` — ${global.name}`:" — none"}</option><option value="none">None for this session</option>
            {documents.filter(document=>document.kind===kind).map(document=><option key={document.id} value={document.id}>{document.name}</option>)}
          </Select>
        </Field>;
      })}
    </div>
    <ResponsiveTableFrame className="catalog-table-scroll booking-rules-table" role="region" aria-label="Selected booking rules" tabIndex={0}>
      <table className="catalog-product-table"><thead><tr><th scope="col">Rule</th><th scope="col">Actions</th></tr></thead><tbody>
        {documentRules.map(({document,rule},index)=><tr key={`${document.id}-${index}`}><td><div className="booking-rule-type-cell"><strong>{rule.kind==="policy"?"Booking Terms & Conditions":rule.label}</strong><small>{document.name}</small></div><span className="booking-rule-copy" title={rule.label}>{rule.kind==="policy"?rule.label:rule.helpText}</span></td><td><span className="muted-text">{document.name}</span></td></tr>)}

      {rules.map(rule => <tr key={rule.id}>
        <td><div className="booking-rule-type-cell"><strong>{rule.kind === "policy" ? "Booking Terms & Conditions" : rule.label}</strong><small>{rule.kind === "policy" ? (requirePolicy ? "Acceptance required" : "Shown at booking") : `${rule.category} · ${typeLabels[rule.type]}`}{rule.required ? " · Required" : ""}</small></div>
        <span className="booking-rule-copy">{rule.kind === "policy" ? rule.label : rule.helpText || (rule.type === "TEXT" ? rule.placeholder : rule.options.join(" · "))}</span></td>
        <td><div className="booking-rule-actions"><Button type="button" variant="ghost" className="booking-rule-icon-button" aria-label={`Edit ${rule.label}`} onClick={() => edit(rule)}><Pencil size={15} /></Button><Button type="button" variant="ghost" className="booking-rule-icon-button" aria-label={`Remove ${rule.kind === "policy" ? "Booking T&C" : "intake question"}: ${rule.label}`} onClick={() => { const next = rules.filter(saved => saved.id !== rule.id); setRules(next); if (!next.some(saved => saved.kind === "policy")) setRequirePolicy(false); }}><Trash2 size={15} /></Button></div></td>
      </tr>)}
      </tbody></table>
      {!rules.length && !documentRules.length && <p className="booking-rules-empty">No intake question or Booking Terms &amp; Conditions added</p>}
    </ResponsiveTableFrame>
    <div className="ui-section-body booking-rules-settings">
    <div className="studio-toggle-strip booking-rules-toggle-strip"><Switch checked={requiresDocumentPolicy || Boolean(requirePolicy && policyText)} disabled={requiresDocumentPolicy || !policyText} label={<>Require T&amp;C<span className="booking-rules-desktop-label"> Acceptance</span></>} aria-label="Require T&C Acceptance" name="requirePolicy" onChange={event => setRequirePolicy(event.currentTarget.checked)} variant="inline" /><Switch checked={requestOnly} label="Require Approval" name="requestOnly" onChange={event => setRequestOnly(event.currentTarget.checked)} variant="inline" /><Switch checked={waitlistEnabled} label="Offer Waitlist" name="waitlistEnabled" onChange={event => setWaitlistEnabled(event.currentTarget.checked)} variant="inline" /></div>
    </div>
    <Modal open={mode !== null} title={mode === "library" ? "Add booking rule" : mode === "save-set" ? "Save rule set" : "Configure booking rule"} className="booking-rule-modal" bodyClassName="booking-rule-modal-body" onClose={() => { if (!pending) setMode(null); }}>
      <div ref={modalBody} className="booking-rule-modal-body" onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); if (mode === "save-set" && !pending) void saveSet(); } }}>
      {mode === "library" && <>
        <p className="ui-field-hint">Contact details belong to the booking flow. Add questions and terms specific to this session.</p>
        <Field label="Search rules"><Input type="search" value={search} onChange={event => setSearch(event.target.value)} /></Field>
        {sets.length > 0 && <section className="booking-rule-category"><h3>Saved rule sets</h3>{sets.filter(set => set.name.toLowerCase().includes(search.toLowerCase())).map(set => <div className="booking-rule-set" key={set.id}><span><strong>{set.name}</strong><small>{set.rules.length} rules</small></span><Button type="button" variant="secondary" onClick={() => add(set.rules)}>Apply {set.name}</Button></div>)}</section>}
        {setsError && <p role="alert">{setsError}</p>}
        {categories.map(category => {
          const categoryRules = library.filter(rule => rule.category === category);
          const entries = categoryRules.filter(rule => `${category} ${rule.label}`.toLowerCase().includes(search.toLowerCase()));
          if (!entries.length) return null;
          return <section className="booking-rule-category" key={category}><header><h3>{category}</h3><Button type="button" variant="secondary" disabled={categoryRules.every(alreadyAdded)} onClick={() => add(categoryRules)}>Add all {category === "Booking Terms & Conditions" ? "Booking T&C" : category}</Button></header><div className="booking-rule-option-list">{entries.map(rule => <Button type="button" variant="ghost" className="booking-rule-option" key={rule.id} disabled={alreadyAdded(rule)} onClick={() => add([rule])}><strong>{rule.label}</strong><span>{rule.kind === "policy" ? "Booking Terms & Conditions" : typeLabels[rule.type]}{alreadyAdded(rule) ? " · Added" : ""}</span></Button>)}</div></section>;
        })}
        <div className="module-modal-actions"><Button type="button" variant="ghost" onClick={() => setMode(null)}>Cancel</Button>{rules.some(rule => !rule.contactField) && <Button type="button" variant="secondary" onClick={() => open("save-set")}>Save as set</Button>}<Button type="button" onClick={() => edit()}>Create rule</Button></div>
      </>}
      {mode === "edit" && draft && <>
        <Field label="Rule kind"><Select value={draft.kind} onChange={event => setDraft({ ...draft, kind: event.target.value as BookingRule["kind"], type: "TEXT", contactField: undefined })}><option value="intake">Intake question</option><option value="policy">Booking Terms &amp; Conditions</option></Select></Field>
        <Field label="Category"><Input value={draft.category} maxLength={80} onChange={event => setDraft({ ...draft, category: event.target.value })} /></Field>
        <Field label={draft.kind === "policy" ? "Booking Terms & Conditions" : "Question"}>{draft.kind === "policy" ? <Textarea value={draft.label} maxLength={2000} onChange={event => setDraft({ ...draft, label: event.target.value })} /> : <Input value={draft.label} maxLength={2000} onChange={event => setDraft({ ...draft, label: event.target.value })} />}</Field>
        {draft.kind === "intake" && <>
          <Field label="Answer type"><Select disabled={Boolean(draft.contactField)} value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value as BookingRule["type"] })}>{Object.entries(typeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></Field>
          {draft.contactField && <p className="ui-field-hint">Uses the existing booking contact field, without asking the client twice.</p>}
          {["RADIO", "SELECT", "CHECKBOX"].includes(draft.type) && <BookingQuestionChoices value={choices} minimumChoices={draft.type === "CHECKBOX" ? 1 : 2} onChange={setChoices} />}
          {draft.type === "TEXT" && <Field label="Placeholder"><Input value={draft.placeholder} maxLength={200} onChange={event => setDraft({ ...draft, placeholder: event.target.value })} /></Field>}
          <Field label="Help text"><Input value={draft.helpText} maxLength={500} onChange={event => setDraft({ ...draft, helpText: event.target.value })} /></Field>
          <Switch label="Required answer" disabled={draft.contactField === "customerName" || draft.contactField === "customerEmail"} checked={draft.contactField === "customerName" || draft.contactField === "customerEmail" || draft.required} onChange={event => setDraft({ ...draft, required: event.target.checked })} />
        </>}
        <div className="module-modal-actions"><Button type="button" variant="ghost" onClick={() => setMode(null)}>Cancel</Button><Button type="button" onClick={saveRule}>Apply rule</Button></div>
      </>}
      {mode === "save-set" && <><p>Save these {rules.filter(rule => !rule.contactField).length} rules for reuse on other services. Applying a set adds copies to that service’s draft.</p><Field label="Set name"><Input value={setName} maxLength={100} disabled={pending} onChange={event => setSetName(event.target.value)} /></Field><div className="module-modal-actions"><Button type="button" variant="ghost" disabled={pending} onClick={() => setMode(null)}>Cancel</Button><Button type="button" disabled={pending} onClick={saveSet}>{pending ? "Saving…" : "Save set"}</Button></div></>}
      {error && <p role="alert">{error}</p>}
      </div>
    </Modal>
  </section>;
}
