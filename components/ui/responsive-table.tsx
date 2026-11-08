"use client";

import { useLayoutEffect, useRef, useState, type HTMLAttributes } from "react";

function minimumWidth(table: HTMLTableElement, frame: HTMLElement) {
  // Measure a short-lived inert copy so card styling never changes the fit decision.
  const probe = table.cloneNode(true) as HTMLTableElement;
  probe.dataset.tableProbe = "";
  probe.inert = true;
  probe.setAttribute("aria-hidden", "true");
  for (const element of [probe, ...probe.querySelectorAll("[id], [name], [form], label[for]")]) {
    for (const attribute of ["id", "name", "form", "for"]) element.removeAttribute(attribute);
  }
  for (const row of probe.querySelectorAll("tbody tr")) {
    if (row.children.length === 1 && (row.firstElementChild as HTMLTableCellElement).colSpan > 1) row.remove();
  }
  Object.assign(probe.style, { position: "absolute", visibility: "hidden", pointerEvents: "none", width: "min-content", minWidth: "0", maxWidth: "none", tableLayout: "auto", top: "0", left: "0" });
  frame.append(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

export function ResponsiveTableFrame({ children, mobileLayout = "cards", ...props }: HTMLAttributes<HTMLDivElement> & { mobileLayout?: "cards" | "columns" }) {
  const root = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState("table");
  useLayoutEffect(() => {
    const frame = root.current;
    const table = frame?.querySelector<HTMLTableElement>(":scope > table:not([data-table-probe])");
    if (!table || !frame) return;
    let scheduled = 0;
    let active = true;
    const mobile = window.matchMedia("(max-width: 860px), (pointer: coarse)");
    function measure() {
      if (!table || !frame) return;
      const headers = Array.from(table.tHead?.rows.item((table.tHead?.rows.length ?? 1) - 1)?.cells ?? []).flatMap(cell => Array<string>(cell.colSpan).fill(cell.textContent?.trim() ?? ""));
      for (const cell of table.tHead?.querySelectorAll("th") ?? []) {
        if (/^actions?$/i.test(cell.textContent?.trim() || "")) (cell as HTMLElement).dataset.tableActions = "";
        else delete (cell as HTMLElement).dataset.tableActions;
      }
      table.setAttribute("role", table.getAttribute("role") || "table");
      for (const body of table.tBodies) {
        body.setAttribute("role", "rowgroup");
        for (const record of body.rows) {
          record.setAttribute("role", "row");
          Array.from(record.cells).forEach((cell, index) => {
            cell.setAttribute("role", cell.tagName === "TH" ? "rowheader" : "cell");
            const label = cell.colSpan === 1 ? cell.dataset.label || headers[index] : "";
            if (label) cell.dataset.tableLabel = label;
            else delete cell.dataset.tableLabel;
          });
        }
      }
      const style = getComputedStyle(frame);
      const available = frame.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (mobile.matches) {
        setLayout(mobileLayout === "columns" ? "compact" : "cards");
        return;
      }
      setLayout(available > 0 && minimumWidth(table, frame) > available + 1 ? "cards" : "table");
    }
    const schedule = () => { if (!active) return; cancelAnimationFrame(scheduled); scheduled = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    measure();
    mobile.addEventListener("change", schedule);
    resize.observe(frame);
    resize.observe(table);
    mutations.observe(table, { childList: true, subtree: true, characterData: true });
    void document.fonts.ready.then(schedule);
    return () => { active = false; mobile.removeEventListener("change", schedule); resize.disconnect(); mutations.disconnect(); cancelAnimationFrame(scheduled); };
  }, [children, mobileLayout]);

  return <div {...props} ref={root} data-responsive-table-frame data-table-layout={layout}>{children}</div>;
}
