"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const fallbackHeaderHeight = 36;
const fallbackRowHeight = 56;
const minRowsPerPage = 3;

function visibleElementHeight(element: Element) {
  return element.getClientRects().length ? element.getBoundingClientRect().height : 0;
}

export function useCatalogTablePagination(itemCount: number) {
  const tableFrameRef = useRef<HTMLDivElement | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [page, setPage] = useState(1);

  const recalculateRows = useCallback(() => {
    const frame = tableFrameRef.current;
    if (!frame || frame.offsetParent === null) return;

    const frameRect = frame.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const measurementRoot = frame.closest(".ui-folder-tabs") || frame.parentElement;
    const footerHeight = [".catalog-table-status-strip", ".catalog-table-pagination"].reduce((total, selector) => {
      const visibleHeight = Array.from(measurementRoot?.querySelectorAll(selector) || []).reduce(
        (sum, element) => sum + visibleElementHeight(element),
        0
      );
      return total + visibleHeight;
    }, 0);
    const headerHeight = frame.querySelector("thead")?.getBoundingClientRect().height || fallbackHeaderHeight;
    const rowHeight =
      frame.querySelector("tbody tr:not(.catalog-table-filler-row):not(.catalog-table-empty-state-row)")?.getBoundingClientRect().height ||
      fallbackRowHeight;
    const bottomReserve = Math.max(36, footerHeight) + 42;
    const availableHeight = Math.max(headerHeight + rowHeight * minRowsPerPage, viewportHeight - frameRect.top - bottomReserve);
    const nextRowsPerPage = Math.max(minRowsPerPage, Math.floor((availableHeight - headerHeight) / rowHeight));

    frame.style.setProperty("--catalog-table-row-height", `${rowHeight}px`);
    frame.style.setProperty("--catalog-table-min-height", `${headerHeight + nextRowsPerPage * rowHeight}px`);
    setRowsPerPage((current) => (current === nextRowsPerPage ? current : nextRowsPerPage));
  }, []);

  const setTableFrameRef = useCallback(
    (node: HTMLDivElement | null) => {
      tableFrameRef.current = node;
      if (node) requestAnimationFrame(recalculateRows);
    },
    [recalculateRows]
  );

  useEffect(() => {
    const frame = tableFrameRef.current;
    if (!frame) return;

    let animationFrame = 0;
    const schedule = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(recalculateRows);
    };

    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("pointerup", schedule);
    window.visualViewport?.addEventListener("resize", schedule);

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resizeObserver?.observe(frame);
    if (frame.parentElement) resizeObserver?.observe(frame.parentElement);

    const panel = frame.closest(".ui-folder-panel");
    const mutationObserver = panel ? new MutationObserver(schedule) : null;
    mutationObserver?.observe(panel as Element, { attributes: true, attributeFilter: ["hidden"] });

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pointerup", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [recalculateRows]);

  const pageCount = Math.max(1, Math.ceil(itemCount / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const startIndex = itemCount ? (currentPage - 1) * rowsPerPage : 0;
  const endIndex = itemCount ? Math.min(itemCount, startIndex + rowsPerPage) : 0;
  const visibleRowCount = Math.max(0, endIndex - startIndex);
  const fillerRowCount = itemCount ? Math.max(0, rowsPerPage - visibleRowCount) : 0;

  return useMemo(
    () => ({
      currentPage,
      emptyRowCount: rowsPerPage,
      endIndex,
      fillerRowCount,
      firstPage: () => setPage(1),
      nextPage: () => setPage((current) => Math.min(pageCount, current + 1)),
      pageCount,
      previousPage: () => setPage((current) => Math.max(1, current - 1)),
      rowsPerPage,
      setTableFrameRef,
      startIndex,
    }),
    [currentPage, endIndex, fillerRowCount, pageCount, rowsPerPage, setTableFrameRef, startIndex]
  );
}
