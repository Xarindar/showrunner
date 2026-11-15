"use client";

import { useLayoutEffect, useRef, useState, type HTMLAttributes } from "react";

export function ResponsiveTableFrame({ children, mobileLayout, ...props }: HTMLAttributes<HTMLDivElement> & { mobileLayout?: "columns" }) {
  const root = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState("table");
  useLayoutEffect(() => {
    const frame = root.current;
    const table = frame?.querySelector<HTMLTableElement>(":scope > table");
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
            if (/^actions?$/i.test(label)) cell.dataset.tableActions = "";
            else delete cell.dataset.tableActions;
            if (label) cell.dataset.tableLabel = label;
            else delete cell.dataset.tableLabel;
          });
        }
      }
    }
    const schedule = () => { if (!active) return; cancelAnimationFrame(scheduled); scheduled = requestAnimationFrame(measure); };
    const mutations = new MutationObserver(schedule);
    const setMobileLayout = () => setLayout(mobileLayout === "columns" && mobile.matches ? "compact" : "table");
    measure();
    setMobileLayout();
    mobile.addEventListener("change", setMobileLayout);
    mutations.observe(table, { childList: true, subtree: true, characterData: true });
    return () => { active = false; mobile.removeEventListener("change", setMobileLayout); mutations.disconnect(); cancelAnimationFrame(scheduled); };
  }, [children, mobileLayout]);

  return <div {...props} ref={root} data-responsive-table-frame data-table-layout={layout}>{children}</div>;
}
