"use client";

import { useId, useRef, useState, type PointerEvent } from "react";
import { AlignLeft, ArrowDown, ArrowLeft, ArrowUp, CalendarDays, ChevronDown, Circle, CircleDot, GripVertical, ListFilter, MoveHorizontal, Plus, Square, SquareCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { BookingQuestionChoices } from "@/modules/scheduling/components/booking-question-choices";
import { bookingRuleSchema, type BookingRule } from "@/lib/scheduling/booking-rules";
import { moveFormField } from "@/lib/scheduling/form-fields";
import styles from "./intake-form-builder.module.css";

type FormDraft = { name: string; rules: BookingRule[]; isDefault: boolean };
type Props = { value: FormDraft; onChange: (value: FormDraft) => void; onSave: () => void; onCancel: () => void; pending: boolean; error: string };
const fieldTypes = [
  { type: "TEXT", label: "Text answer", icon: AlignLeft },
  { type: "RADIO", label: "Single choice", icon: CircleDot },
  { type: "SELECT", label: "Dropdown", icon: ListFilter },
  { type: "CHECKBOX", label: "Checkboxes", icon: SquareCheck },
  { type: "DATE", label: "Date", icon: CalendarDays }
] as const;
const fieldWidths = [
  { value: "THIRD", label: "Third width", fraction: 1 / 3 },
  { value: "HALF", label: "Half width", fraction: 1 / 2 },
  { value: "FULL", label: "Full width", fraction: 1 }
] as const;

export function IntakeFormBuilder({ value, onChange, onSave, onCancel, pending, error }: Props) {
  const [selectedId, setSelectedId] = useState(value.rules[0]?.id ?? "");
  const [dragging, setDragging] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; target: string } | null>(null);
  const resize = useRef<{ id: string; x: number; width: number; available: number } | null>(null);
  const instructionsId = useId();
  const selected = value.rules.find(rule => rule.id === selectedId);
  const index = value.rules.findIndex(rule => rule.id === selectedId);

  function addField(type: BookingRule["type"]) {
    if (value.rules.length >= 40 || pending) return;
    const field: BookingRule = { id: crypto.randomUUID(), kind: "intake", category: "Session details", label: "New question", type, required: false, placeholder: "", helpText: "", options: type === "TEXT" || type === "DATE" ? [] : ["Option 1", "Option 2"] };
    onChange({ ...value, rules: [...value.rules, field] });
    setSelectedId(field.id);
    setAnnouncement(`${fieldTypes.find(item => item.type === type)?.label} added.`);
  }
  function updateField(update: Partial<BookingRule>) {
    onChange({ ...value, rules: value.rules.map(rule => rule.id === selectedId ? { ...rule, ...update } : rule) });
  }
  function setWidth(id: string, width: NonNullable<BookingRule["width"]>) {
    onChange({ ...value, rules: value.rules.map(rule => rule.id === id ? { ...rule, width } : rule) });
  }
  function resizeField(event: PointerEvent<HTMLButtonElement>) {
    if (!resize.current) return;
    const fraction = (resize.current.width + event.clientX - resize.current.x) / resize.current.available;
    const closest = fieldWidths.reduce((best, size) => Math.abs(size.fraction - fraction) < Math.abs(best.fraction - fraction) ? size : best);
    setWidth(resize.current.id, closest.value);
  }
  function endResize() {
    if (!resize.current) return;
    const rule = value.rules.find(item => item.id === resize.current?.id);
    setAnnouncement(`${rule?.label} resized to ${fieldWidths.find(size => size.value === (rule?.width ?? "FULL"))?.label.toLowerCase()}.`);
    resize.current = null;
  }
  function move(id: string, targetId: string) {
    const rules = moveFormField(value.rules, id, targetId);
    if (rules === value.rules) return;
    onChange({ ...value, rules });
    setAnnouncement(`${rules.find(rule => rule.id === id)?.label} moved to position ${rules.findIndex(rule => rule.id === id) + 1}.`);
  }
  function removeField(id: string) {
    const position = value.rules.findIndex(rule => rule.id === id);
    const rules = value.rules.filter(rule => rule.id !== id);
    onChange({ ...value, rules });
    if (selectedId === id) setSelectedId((rules[position] ?? rules[position - 1])?.id ?? "");
    setAnnouncement("Field removed.");
  }
  function dragOver(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-form-field]");
    if (target && canvas.current?.contains(target)) {
      drag.current.target = target.dataset.formField!;
      setOverId(drag.current.target);
    }
  }
  function endDrag(cancelled = false) {
    if (drag.current && !cancelled) move(drag.current.id, drag.current.target);
    drag.current = null;
    setDragging(null);
    setOverId(null);
  }

  return <section className={styles.builder} aria-label="Intake form builder">
    <h1 className="ui-sr-only">Intake form editor</h1>
    <header className={styles.header}>
      <Button variant="ghost" disabled={pending} onClick={onCancel}><ArrowLeft size={16} />Forms &amp; Terms</Button>
      <Field label="Form name"><Input value={value.name} maxLength={100} placeholder="Untitled form" autoComplete="off" disabled={pending} onChange={event => onChange({ ...value, name: event.target.value })} /></Field>
      <Button disabled={pending} onClick={() => {
        const invalid = value.rules.find(rule => !bookingRuleSchema.safeParse(rule).success);
        if (invalid) setSelectedId(invalid.id);
        onSave();
      }}>{pending ? "Saving…" : "Save form"}</Button>
    </header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <p className="ui-sr-only" id={instructionsId}>Drag a field by its handle to reorder it. With a handle focused, use the up and down arrow keys to move the field.</p>
    <p className="ui-sr-only" role="status">{announcement}</p>
    <fieldset className={styles.layout} disabled={pending}>
      <aside className={styles.palette} aria-label="Add fields">
        <h2>Add fields</h2>
        <div className={styles.fieldTypes}>{fieldTypes.map(({ type, label, icon: Icon }) => <Button key={type} variant="secondary" disabled={value.rules.length >= 40} onClick={() => addField(type)}><Icon size={18} /><span>{label}</span><Plus size={14} /></Button>)}</div>
        <p className="ui-field-hint">Contact details are collected separately during booking.</p>
      </aside>
      <div className={styles.canvasArea}>
        <div className={styles.canvasHeader}><h2>Form preview</h2><span>{value.rules.length} / 40 fields</span></div>
        <div ref={canvas} className={styles.canvas}>
          <h3>{value.name.trim() || "Untitled form"}</h3>
          {!value.rules.length && <div className={styles.empty}><AlignLeft size={28} /><h4>Build your intake form</h4><p>Choose a field on the left to get started.</p><Button variant="secondary" onClick={() => addField("TEXT")}><Plus size={16} />Add your first field</Button></div>}
          <div className={styles.fields} aria-label="Form fields">{value.rules.map((rule, position) => <article key={rule.id} data-form-field={rule.id} data-width={rule.width ?? "FULL"} className={styles.field} data-selected={selectedId === rule.id} data-dragging={dragging === rule.id} data-drop={overId === rule.id && dragging !== rule.id}>
            <div className={styles.fieldToolbar}>
              <Button variant="ghost" size="sm" className={styles.handle} aria-label={`Move ${rule.label || "untitled field"}`} aria-describedby={instructionsId}
                onPointerDown={event => {
                  if (event.button !== 0 || pending) return;
                  event.preventDefault();
                  event.currentTarget.focus();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = { id: rule.id, target: rule.id };
                  setDragging(rule.id); setSelectedId(rule.id);
                }} onPointerMove={dragOver} onPointerUp={() => endDrag()} onPointerCancel={() => endDrag(true)} onLostPointerCapture={() => endDrag(true)}
                onKeyDown={event => {
                  if (event.key === "Escape") endDrag(true);
                  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                  event.preventDefault();
                  const target = value.rules[position + (event.key === "ArrowUp" ? -1 : 1)];
                  if (target) move(rule.id, target.id);
                }}><GripVertical size={16} /></Button>
              <span>{rule.kind === "policy" ? "Booking terms" : fieldTypes.find(item => item.type === rule.type)?.label}</span>
              <Button variant="ghost" size="sm" aria-label={`Remove ${rule.label || "untitled field"}`} onClick={() => removeField(rule.id)}><Trash2 size={15} /></Button>
            </div>
            <button type="button" className={styles.fieldPreview} onClick={() => setSelectedId(rule.id)} aria-label={`Edit ${rule.label || "untitled field"}`} aria-pressed={selectedId === rule.id}>
              <span className={styles.question}>{rule.label || "Untitled field"}{rule.required && <span aria-label="required"> *</span>}</span>
              {rule.kind === "policy" ? null : rule.type === "RADIO" || rule.type === "CHECKBOX" ? <span className={styles.options}>{rule.type === "CHECKBOX" && <span className={styles.help}>Select all that apply</span>}{rule.options.map((option, optionIndex) => <span key={optionIndex}>{rule.type === "CHECKBOX" ? <Square size={16} /> : <Circle size={16} />}{option || `Option ${optionIndex + 1}`}</span>)}</span> : <span className={styles.answer}>{rule.type === "DATE" ? "Choose a date" : rule.placeholder || (rule.type === "SELECT" ? "Select an option" : "Your answer")}{rule.type === "SELECT" && <ChevronDown size={16} />}{rule.type === "DATE" && <CalendarDays size={16} />}</span>}
              {rule.helpText && <span className={styles.help}>{rule.helpText}</span>}
            </button>
            <div className={styles.fieldSize}>
              <span>{fieldWidths.find(size => size.value === (rule.width ?? "FULL"))?.label}</span>
              <Button variant="ghost" size="sm" className={styles.resizeHandle} aria-label={`Resize ${rule.label || "untitled field"}`} title="Drag to resize, or use left and right arrow keys"
                onPointerDown={event => {
                  if (event.button !== 0 || pending) return;
                  event.preventDefault();
                  event.currentTarget.focus();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  const field = event.currentTarget.closest<HTMLElement>("[data-form-field]")!;
                  resize.current = { id: rule.id, x: event.clientX, width: field.getBoundingClientRect().width, available: field.parentElement!.getBoundingClientRect().width };
                  setSelectedId(rule.id);
                }} onPointerMove={resizeField} onPointerUp={endResize} onPointerCancel={endResize} onLostPointerCapture={endResize}
                onKeyDown={event => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  const current = fieldWidths.findIndex(size => size.value === (rule.width ?? "FULL"));
                  const size = fieldWidths[current + (event.key === "ArrowLeft" ? -1 : 1)];
                  if (size) { setWidth(rule.id, size.value); setAnnouncement(`${rule.label} resized to ${size.label.toLowerCase()}.`); }
                }}><MoveHorizontal size={16} /></Button>
            </div>
          </article>)}</div>
        </div>
      </div>
      <aside className={styles.inspector} aria-label="Field settings">
        <h2>Field settings</h2>
        {selected ? <div className={styles.settings}>
          <Field label={selected.kind === "policy" ? "Booking terms" : "Question"}><Textarea value={selected.label} maxLength={selected.kind === "policy" ? 20000 : 2000} onChange={event => updateField({ label: event.target.value })} /></Field>
          <Field label="Field width" hint="Fields stack on phones."><Select value={selected.width ?? "FULL"} onChange={event => setWidth(selected.id, event.target.value as NonNullable<BookingRule["width"]>)}>{[...fieldWidths].reverse().map(size => <option key={size.value} value={size.value}>{size.label}</option>)}</Select></Field>
          {selected.kind === "intake" && <>
            <Field label="Answer type"><Select value={selected.type} onChange={event => {
              const type = event.target.value as BookingRule["type"];
              updateField({ type, options: type === "TEXT" || type === "DATE" ? [] : selected.options.length ? selected.options : ["Option 1", "Option 2"] });
            }}>{fieldTypes.map(item => <option key={item.type} value={item.type}>{item.label}</option>)}</Select></Field>
            {selected.type === "TEXT" && <Field label="Placeholder"><Input value={selected.placeholder} maxLength={200} onChange={event => updateField({ placeholder: event.target.value })} /></Field>}
            {["RADIO", "SELECT", "CHECKBOX"].includes(selected.type) && <BookingQuestionChoices value={selected.options} minimumChoices={selected.type === "CHECKBOX" ? 1 : 2} onChange={options => updateField({ options })} />}
            <Field label="Help text"><Input value={selected.helpText} maxLength={500} onChange={event => updateField({ helpText: event.target.value })} /></Field>
            <Switch label="Required answer" checked={selected.required} onChange={event => updateField({ required: event.target.checked })} />
          </>}
          <div className={styles.position}><Button variant="secondary" disabled={index <= 0} onClick={() => move(selected.id, value.rules[index - 1].id)}><ArrowUp size={15} />Move up</Button><Button variant="secondary" disabled={index === value.rules.length - 1} onClick={() => move(selected.id, value.rules[index + 1].id)}><ArrowDown size={15} />Move down</Button></div>
        </div> : <p className="ui-field-hint">Select a field in the preview to edit it.</p>}
        <div className={styles.formSettings}><h2>Form settings</h2><Switch label="Default for all bookings" description="Sessions can choose a different form or none." checked={value.isDefault} onChange={event => onChange({ ...value, isDefault: event.target.checked })} /></div>
      </aside>
    </fieldset>
  </section>;
}
