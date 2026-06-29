"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cx } from "./utils";

export type SelectMenuOption = {
  label: string;
  value: string;
};

type SelectMenuProps = {
  className?: string;
  id: string;
  label: string;
  name: string;
  options: SelectMenuOption[];
  value: string;
};

function normalizedValue(options: SelectMenuOption[], value: string) {
  return options.some((option) => option.value === value) ? value : options[0]?.value || "";
}

export function SelectMenu({ className, id, label, name, options, value }: SelectMenuProps) {
  const generatedId = useId();
  const [open, setOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(() => normalizedValue(options, value));
  const rootRef = useRef<HTMLDivElement>(null);
  const labelId = `${id || generatedId}-label`;
  const listboxId = `${id || generatedId}-listbox`;
  const safeSelectedValue = normalizedValue(options, selectedValue);
  const selectedOption = options.find((option) => option.value === safeSelectedValue) || options[0] || { label: "", value: "" };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const moveSelection = (direction: number) => {
    if (!options.length) return;
    const currentIndex = Math.max(0, options.findIndex((option) => option.value === safeSelectedValue));
    const nextIndex = (currentIndex + direction + options.length) % options.length;
    setSelectedValue(options[nextIndex].value);
    setOpen(true);
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSelection(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(-1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((current) => !current);
    }
  };

  return (
    <div className={cx("ui-select-menu", className)} data-open={open ? "true" : undefined} ref={rootRef}>
      <input name={name} type="hidden" value={selectedOption.value} />
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="ui-select-trigger"
        id={id}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        type="button">
        <span className="ui-select-label" id={labelId}>
          {label}
        </span>
        <span className="ui-select-value">{selectedOption.label}</span>
        <ChevronDown aria-hidden="true" size={15} />
      </button>

      {open ? (
        <div aria-labelledby={labelId} className="ui-select-popover" id={listboxId} role="listbox">
          {options.map((option) => {
            const selected = option.value === selectedOption.value;
            return (
              <button
                aria-selected={selected}
                className={cx("ui-select-option", selected && "is-selected")}
                key={option.value}
                onClick={() => {
                  setSelectedValue(option.value);
                  setOpen(false);
                }}
                role="option"
                type="button">
                <span>{option.label}</span>
                {selected ? <Check aria-hidden="true" size={14} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
