"use client";

import { useCallback, useState } from "react";
import { defaultTablePageSize } from "@/lib/admin-table-pagination";

export function useCatalogTablePagination(itemCount: number) {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(defaultTablePageSize);
  const pageCount = Math.max(1, Math.ceil(itemCount / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const resizePage = useCallback((size: number) => {
    if (size === rowsPerPage) return;
    setPage(Math.floor((currentPage - 1) * rowsPerPage / size) + 1);
    setRowsPerPage(size);
  }, [currentPage, rowsPerPage]);
  const startIndex = itemCount ? (currentPage - 1) * rowsPerPage : 0;
  return { currentPage, pageCount, startIndex, resizePage, endIndex: Math.min(itemCount, startIndex + rowsPerPage),
    firstPage: () => setPage(1), nextPage: () => setPage(current => Math.min(pageCount, current + 1)), previousPage: () => setPage(current => Math.max(1, current - 1)) };
}
