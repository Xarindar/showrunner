"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Input } from "./field";

export function LocationInput({ id, name, defaultValue = "", placeholder }: { id: string; name: string; defaultValue?: string; placeholder?: string }) {
  const listId = useId();
  const control = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const expanded = open && (query.trim().length > 0 || suggestions.length > 0);
  const choose = (label: string) => {
    setValue(label);
    setQuery("");
    setSuggestions([]);
    setSearching(false);
    setOpen(false);
    setActive(-1);
  };
  useLayoutEffect(() => {
    const popup = menu.current;
    const anchor = control.current;
    if (!expanded || !popup || !anchor) return;
    popup.showPopover();
    const position = () => {
      const bounds = anchor.getBoundingClientRect();
      popup.style.maxHeight = "";
      const style = getComputedStyle(popup);
      const gap = Number.parseFloat(style.paddingTop) || 0;
      const maxHeight = Number.parseFloat(style.maxHeight) || popup.scrollHeight;
      popup.style.width = `${Math.min(bounds.width, window.innerWidth - gap * 2)}px`;
      const below = window.innerHeight - bounds.bottom - gap * 2;
      const above = bounds.top - gap * 2;
      const flip = below < Math.min(popup.scrollHeight, maxHeight) && above > below;
      Object.assign(popup.style, {
        left: `${Math.max(gap, Math.min(bounds.left, window.innerWidth - bounds.width - gap))}px`,
        maxHeight: `${Math.max(0, Math.min(maxHeight, flip ? above : below))}px`,
        top: flip ? "auto" : `${bounds.bottom + gap}px`,
        bottom: flip ? `${window.innerHeight - bounds.top + gap}px` : "auto"
      });
    };
    position();
    const resize = new ResizeObserver(position);
    resize.observe(anchor);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => { resize.disconnect(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [expanded, suggestions, searching, unavailable]);
  useEffect(() => {
    if (query.trim().length < 3 || query.length > 200) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/locations?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Location search unavailable");
        const data = await response.json();
        if (!controller.signal.aborted) {
          setSuggestions(Array.isArray(data.suggestions) ? data.suggestions.filter((item: unknown): item is string => typeof item === "string").slice(0, 5) : []);
          setUnavailable(Boolean(data.unavailable));
        }
      } catch {
        if (!controller.signal.aborted) setUnavailable(true);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 450);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  return <>
    <div className="ui-select-control" ref={control}>
    <Input id={id} name={name} value={value} maxLength={500} placeholder={placeholder} autoComplete="off"
      role="combobox" aria-autocomplete="list" aria-expanded={expanded}
      aria-controls={expanded ? listId : undefined}
      aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
      aria-describedby={`${listId}-help`}
      onFocus={() => setOpen(true)}
      onBlur={() => { setOpen(false); setActive(-1); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length) {
          event.preventDefault();
          setOpen(true);
          setActive(event.key === "ArrowDown" ? (active + 1) % suggestions.length : (active < 0 ? suggestions.length - 1 : (active - 1 + suggestions.length) % suggestions.length));
        } else if (event.key === "Enter" && expanded && active >= 0) {
          event.preventDefault();
          choose(suggestions[active]);
        } else if (event.key === "Escape" && expanded) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          setActive(-1);
        }
      }}
      onChange={event => {
      setValue(event.target.value);
      setQuery(event.target.value);
      setSuggestions([]);
      setUnavailable(false);
      setSearching(event.target.value.trim().length >= 3 && event.target.value.length <= 200);
      setOpen(true);
      setActive(-1);
    }} />
    {expanded ? <div ref={menu} popover="manual" id={listId} role="listbox" aria-label="Location suggestions" className="ui-select-popover ui-location-options">
      {!suggestions.length ? <div className="ui-select-option ui-location-status" role="option" aria-disabled="true" aria-selected="false">
        <span role="status">{searching ? "Searching addresses…" : query.trim().length < 3 ? "Type at least 3 characters to search." : unavailable ? "Suggestions unavailable. Enter an address manually." : query.length > 200 ? "Enter a shorter address to search." : "No matches found. You can enter an address manually."}</span>
      </div> : null}
      {suggestions.map((label, index) => <button key={`${index}-${label}`} id={`${listId}-${index}`} type="button" role="option"
        aria-selected={index === active} tabIndex={-1} className={`ui-select-option${index === active ? " is-active" : ""}`}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(label)}>
        <span>{label}</span>
      </button>)}
    </div> : null}
    </div>
    <span className="ui-help" id={`${listId}-help`}>{unavailable ? "Suggestions unavailable. You can still enter a location. " : ""}Suggestions by <a href="https://photon.komoot.io" target="_blank" rel="noreferrer">Photon</a> / <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>.</span>
  </>;
}
