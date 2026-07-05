"use client";

import { Check, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cx } from "./utils";

export type OptionPickerGroup = {
  id: string;
  label: string;
};

export type OptionPickerOption = {
  defaultChecked?: boolean;
  description?: string;
  disabled?: boolean;
  group?: string;
  label: string;
  meta?: string;
  value: string;
};

type OptionPickerProps = {
  className?: string;
  description?: string;
  groups?: OptionPickerGroup[];
  legend: string;
  name: string;
  options: OptionPickerOption[];
};

function textMatch(value: string, query: string) {
  return value.toLowerCase().includes(query);
}

export function OptionPicker({ className, description, groups = [], legend, name, options }: OptionPickerProps) {
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState("all");
  const [selected, setSelected] = useState(() => new Set(options.filter((option) => option.defaultChecked).map((option) => option.value)));
  const groupLabelById = useMemo(() => new Map(groups.map((group) => [group.id, group.label])), [groups]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = options.filter((option) => {
    const groupLabel = option.group ? groupLabelById.get(option.group) || option.group : "";
    const matchesGroup = activeGroup === "all" || option.group === activeGroup;
    const matchesQuery =
      !normalizedQuery ||
      textMatch(option.label, normalizedQuery) ||
      textMatch(option.description || "", normalizedQuery) ||
      textMatch(option.meta || "", normalizedQuery) ||
      textMatch(groupLabel, normalizedQuery);

    return matchesGroup && matchesQuery;
  });
  const selectedOptions = options.filter((option) => selected.has(option.value));
  const selectableVisibleOptions = visibleOptions.filter((option) => !option.disabled);

  function toggleValue(value: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(value);
      else next.delete(value);
      return next;
    });
  }

  function selectVisible() {
    setSelected((current) => {
      const next = new Set(current);
      selectableVisibleOptions.forEach((option) => next.add(option.value));
      return next;
    });
  }

  function clearVisible() {
    setSelected((current) => {
      const next = new Set(current);
      selectableVisibleOptions.forEach((option) => next.delete(option.value));
      return next;
    });
  }

  function clearValue(value: string) {
    setSelected((current) => {
      const next = new Set(current);
      next.delete(value);
      return next;
    });
  }

  return (
    <fieldset className={cx("ui-option-picker", className)}>
      <legend className="ui-option-picker-legend">
        <span>{legend}</span>
        <span className="ui-option-picker-count">
          {selected.size} selected
        </span>
      </legend>
      {description ? <p className="ui-option-picker-description">{description}</p> : null}

      <div className="ui-option-picker-tools">
        <label className="ui-option-picker-search">
          <Search size={16} aria-hidden="true" />
          <span className="ui-hidden">Search options</span>
          <input
            aria-label={`Search ${legend}`}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search modules"
            type="search"
            value={query}
          />
        </label>
        <div className="ui-option-picker-actions">
          <button disabled={!selectableVisibleOptions.length} onClick={selectVisible} type="button">
            Select visible
          </button>
          <button disabled={!selectableVisibleOptions.length} onClick={clearVisible} type="button">
            Clear visible
          </button>
        </div>
      </div>

      {groups.length ? (
        <div className="ui-option-picker-groups" aria-label={`${legend} groups`}>
          <button aria-pressed={activeGroup === "all"} onClick={() => setActiveGroup("all")} type="button">
            All
          </button>
          {groups.map((group) => (
            <button aria-pressed={activeGroup === group.id} key={group.id} onClick={() => setActiveGroup(group.id)} type="button">
              {group.label}
            </button>
          ))}
        </div>
      ) : null}

      {selectedOptions.length ? (
        <div className="ui-option-picker-selected" aria-label="Selected options">
          {selectedOptions.map((option) => (
            <span className="ui-option-picker-chip" key={option.value}>
              {option.label}
              <button aria-label={`Remove ${option.label}`} onClick={() => clearValue(option.value)} type="button">
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="ui-option-picker-list" role="list">
        {visibleOptions.map((option) => {
          const checked = selected.has(option.value);
          const groupLabel = option.group ? groupLabelById.get(option.group) : "";

          return (
            <label className={cx("ui-option-picker-item", checked && "is-selected", option.disabled && "is-disabled")} key={option.value} role="listitem">
              <input
                checked={checked}
                disabled={option.disabled}
                name={name}
                onChange={(event) => toggleValue(option.value, event.target.checked)}
                type="checkbox"
                value={option.value}
              />
              <span className="ui-option-picker-check" aria-hidden="true">
                {checked ? <Check size={14} /> : null}
              </span>
              <span className="ui-option-picker-copy">
                <span>
                  <strong>{option.label}</strong>
                  {option.meta ? <em>{option.meta}</em> : null}
                </span>
                {option.description ? <small>{option.description}</small> : null}
                {groupLabel ? <small>{groupLabel}</small> : null}
              </span>
            </label>
          );
        })}
        {!visibleOptions.length ? <p className="ui-option-picker-empty">No options match this search.</p> : null}
      </div>
    </fieldset>
  );
}
