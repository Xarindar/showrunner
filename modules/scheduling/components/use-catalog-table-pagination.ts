"use client";

import { useState } from "react";

const rowsPerPage = 25;
export function useCatalogTablePagination(itemCount: number) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(itemCount / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const startIndex = itemCount ? (currentPage - 1) * rowsPerPage : 0;
  return { currentPage, pageCount, startIndex, endIndex: Math.min(itemCount, startIndex + rowsPerPage),
    firstPage: () => setPage(1), nextPage: () => setPage(current => Math.min(pageCount, current + 1)), previousPage: () => setPage(current => Math.max(1, current - 1)) };
}
