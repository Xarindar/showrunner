"use client";

import { useEffect, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import styles from "./booking-question-choices.module.css";

export function BookingQuestionChoices({ value, onChange }: { value: string[]; onChange: (choices: string[]) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const previousLength = useRef(value.length);
  useEffect(() => {
    if (value.length > previousLength.current) list.current?.querySelector<HTMLInputElement>(":scope > div:last-child > input")?.focus();
    previousLength.current = value.length;
  }, [value.length]);

  return <fieldset className={styles.choices}>
    <legend className="ui-field-label">Choices</legend>
    <div ref={list} className={styles.list}>
      {value.map((choice, index) => <div key={index} className={styles.row}>
        <Input aria-label={`Choice ${index + 1}`} placeholder={`Choice ${index + 1}`} maxLength={200} value={choice} onChange={event => onChange(value.map((item, position) => position === index ? event.target.value : item))} />
        <Button variant="ghost" size="sm" aria-label={`Remove choice ${index + 1}`} onClick={() => onChange(value.filter((_, position) => position !== index))}><Trash2 size={16} /></Button>
      </div>)}
    </div>
    <Button variant="secondary" size="sm" className={styles.add} disabled={value.length >= 30} onClick={() => onChange([...value, ""])}><Plus size={16} />Add choice</Button>
    <span className="ui-field-hint">Add at least two different choices.</span>
  </fieldset>;
}
