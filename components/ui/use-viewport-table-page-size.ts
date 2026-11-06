"use client";

import { useEffect, useRef, type RefObject } from "react";

// Measure actual rows so wrapped text, touch layouts and browser zoom count too.
export function useViewportTablePageSize(
  paginationRef: RefObject<HTMLElement | null>,
  onSizeChange?: (size: number) => void
) {
  const rowMetrics = useRef({ width: 0, height: 0 });
  useEffect(() => {
    const pagination = paginationRef.current;
    const root = pagination?.closest<HTMLElement>("[data-viewport-table]");
    if (!root || !pagination || !onSizeChange) return;
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    const measure = () => {
      const rows = Array.from(root.querySelectorAll<HTMLElement>("tbody > tr, [data-viewport-row]"))
        .filter(row => row.getBoundingClientRect().height > 0 && !row.querySelector("[colspan]") && !row.closest("dialog, [role=dialog]"));
      const main = root.closest<HTMLElement>(".admin-main");
      const mainStyle = main && getComputedStyle(main);
      const mainScrolls = mainStyle && /auto|scroll/.test(mainStyle.overflowY);
      const viewportBottom = window.visualViewport?.height ?? window.innerHeight;
      const bottom = mainScrolls ? Math.min(viewportBottom, main!.getBoundingClientRect().bottom) : viewportBottom;
      const scroll = window.scrollY + (mainScrolls ? main!.scrollTop : 0);
      const padding = mainStyle ? parseFloat(mainStyle.paddingBottom) || 0 : 0;
      const rootBottom = root.getBoundingClientRect().bottom;
      const fillProperty = "--viewport-table-fill";
      const currentFill = parseFloat(root.style.getPropertyValue(fillProperty)) || 0;
      const availableBottom = bottom - padding;
      const fill = Math.max(0, Math.round(availableBottom - rootBottom - scroll + currentFill));
      if (fill !== currentFill) root.style.setProperty(fillProperty, `${fill}px`);
      if (!rows.length) return;

      const firstTop = rows[0].getBoundingClientRect().top + scroll;
      const lastBottom = rows.at(-1)!.getBoundingClientRect().bottom;
      // Measure the footer without the flexible space so it never reduces row capacity.
      const footer = root.getBoundingClientRect().bottom - lastBottom - fill;
      const gap = parseFloat(getComputedStyle(rows[0].parentElement!).rowGap) || 0;
      const measuredHeight = Math.max(...rows.map(row => row.getBoundingClientRect().height + (parseFloat(getComputedStyle(row).marginBottom) || 0))) + gap;
      const width = root.getBoundingClientRect().width;
      // Keep the tallest measured row at this width to avoid page-size loops on mixed-height records.
      rowMetrics.current = { width, height: width === rowMetrics.current.width ? Math.max(rowMetrics.current.height, measuredHeight) : measuredHeight };
      const rowHeight = rowMetrics.current.height;
      const size = Math.max(1, Math.min(100, Math.floor((availableBottom - firstTop - footer) / rowHeight)));
      onSizeChange(size);
    };
    const schedule = () => { if (active) { clearTimeout(timer); timer = setTimeout(measure, 150); } };
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    resize.observe(pagination);
    const mutation = new MutationObserver(schedule);
    mutation.observe(root, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    document.fonts.ready.then(schedule);
    schedule();
    return () => {
      active = false;
      clearTimeout(timer);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [paginationRef, onSizeChange]);
}
