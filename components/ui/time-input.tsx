"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { formatTimeValue, parseTimeValue } from "@/lib/format";

type TimeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

// Visible AM/PM text is independent of the device's native time-picker locale.
export function TimeInput({ value, defaultValue = "", name, onValueChange, onBlur, onFocus, onClick, onKeyDown, ...props }: TimeInputProps) {
  const [text, setText] = useState(() => formatTimeValue(value ?? defaultValue));
  const [previousValue, setPreviousValue] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  const selection = useRef<number | null>(null);
  const digits = useRef("");
  const justFocused = useRef(false);
  const selectSegment = (segment: number) => {
    const field = input.current;
    if (!field) return;
    const colon = field.value.indexOf(":"), space = field.value.indexOf(" ");
    if (colon < 0 || space < 0) return;
    field.setSelectionRange(segment === 0 ? 0 : segment === 1 ? colon + 1 : space + 1, segment === 0 ? colon : segment === 1 ? space : field.value.length);
  };
  useLayoutEffect(() => {
    if (selection.current !== null) {
      selectSegment(selection.current);
      selection.current = null;
    }
  }, [text]);
  const updateText = (nextText: string, segment?: number) => {
    const next = parseTimeValue(nextText);
    setText(nextText);
    if (value !== undefined) setPreviousValue(next);
    onValueChange?.(next);
    if (segment !== undefined) {
      if (input.current?.value === nextText) selectSegment(segment);
      else selection.current = segment;
    }
  };
  if (value !== previousValue) {
    setPreviousValue(value);
    setText(formatTimeValue(value ?? defaultValue));
  }
  useEffect(() => {
    const form = input.current?.form;
    const reset = (event: Event) => {
      if (event.defaultPrevented || value !== undefined) return;
      setText(formatTimeValue(defaultValue));
    };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue, value]);
  const canonical = parseTimeValue(text);
  return <>
    {name && <input type="hidden" name={name} form={props.form} value={canonical} disabled={props.disabled} />}
    <input {...props} ref={input} type="text" value={text} placeholder="9:00 AM" autoCapitalize="characters"
      pattern="(0?[1-9]|1[0-2]):[0-5][0-9] *[AaPp][Mm]" title="Enter a time with AM or PM, such as 9:00 AM or 5:30 PM."
      onFocus={event => { justFocused.current = true; digits.current = ""; selectSegment(0); onFocus?.(event); }}
      onClick={event => {
        const field = event.currentTarget;
        const caret = field.selectionStart ?? 0;
        const segment = justFocused.current || caret <= field.value.indexOf(":") ? 0 : caret <= field.value.indexOf(" ") ? 1 : 2;
        justFocused.current = false;
        digits.current = "";
        selectSegment(segment);
        onClick?.(event);
      }}
      onKeyDown={event => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey || props.readOnly) return;
        justFocused.current = false;
        const field = event.currentTarget;
        const caret = field.selectionStart ?? 0;
        const parts = /^(\d{1,2}):(\d{2}) (AM|PM)$/i.exec(field.value);
        const segment = !parts || caret <= field.value.indexOf(":") ? 0 : caret <= field.value.indexOf(" ") ? 1 : 2;
        if ((event.key === "Tab" && parts && (event.shiftKey ? segment > 0 : segment < 2)) || event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === ":") {
          event.preventDefault();
          digits.current = "";
          selectSegment(Math.max(0, Math.min(2, segment + (event.shiftKey || event.key === "ArrowLeft" ? -1 : 1))));
        } else if (/^\d$/.test(event.key) && segment < 2) {
          event.preventDefault();
          const typed = digits.current + event.key;
          if (Number(typed) > (segment === 0 ? 12 : 59) || (segment === 0 && typed === "00")) return;
          const complete = typed.length === 2 || Number(typed) > (segment === 0 ? 1 : 5);
          const hour = segment === 0 ? String(Number(typed)) : parts?.[1] || "12";
          const minute = segment === 1 ? typed.padStart(2, "0") : parts?.[2] || "00";
          digits.current = complete ? "" : typed;
          updateText(`${hour}:${minute} ${parts?.[3] || "AM"}`, complete ? segment + 1 : segment);
        } else if (/^[ap]$/i.test(event.key) && segment === 2) {
          event.preventDefault();
          updateText(`${parts?.[1] || "12"}:${parts?.[2] || "00"} ${event.key.toUpperCase()}M`, 2);
        } else if (/^m$/i.test(event.key) && segment === 2) {
          event.preventDefault();
        } else {
          digits.current = "";
          if (event.key === "Tab") justFocused.current = false;
        }
      }}
      onChange={event => {
        digits.current = "";
        updateText(event.target.value);
      }} onBlur={event => {
        digits.current = "";
        if (canonical) setText(formatTimeValue(canonical));
        onBlur?.(event);
      }} />
  </>;
}

export function DateTimeInput({ defaultValue = "", name, id, required, disabled, "aria-label": label = "Appointment", ...props }: Omit<TimeInputProps, "value" | "onValueChange">) {
  const [date, setDate] = useState(defaultValue.split("T")[0]);
  const [time, setTime] = useState(defaultValue.split("T")[1] || "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = input.current?.form;
    const reset = (event: Event) => {
      if (event.defaultPrevented) return;
      setDate(defaultValue.split("T")[0]);
      setTime(defaultValue.split("T")[1] || "");
    };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue]);
  return <span className="ui-date-time-input" role="group" aria-label={label}>
    <input type="hidden" name={name} form={props.form} value={date && time ? `${date}T${time}` : ""} disabled={disabled} />
    <input {...props} ref={input} id={id} type="date" aria-label={`${label} date`} value={date} required={required || Boolean(time)} disabled={disabled} onChange={event => setDate(event.target.value)} />
    <TimeInput aria-label={`${label} time`} form={props.form} value={time} required={required || Boolean(date)} disabled={disabled} onValueChange={setTime} />
  </span>;
}
