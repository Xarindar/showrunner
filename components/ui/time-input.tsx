"use client";

import { useEffect, useRef, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { formatTimeValue, parseTimeValue } from "@/lib/format";

type TimeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

// Visible AM/PM text is independent of the device's native time-picker locale.
export function TimeInput({ value, defaultValue = "", name, onValueChange, onBlur, ...props }: TimeInputProps) {
  const [text, setText] = useState(() => formatTimeValue(value ?? defaultValue));
  const [previousValue, setPreviousValue] = useState(value);
  const input = useRef<HTMLInputElement>(null);
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
      onChange={event => {
        const next = parseTimeValue(event.target.value);
        setText(event.target.value);
        if (value !== undefined) setPreviousValue(next);
        onValueChange?.(next);
      }} onBlur={event => {
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
