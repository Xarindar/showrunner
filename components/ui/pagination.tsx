"use client";

import { useCallback, useRef, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { tablePageHref } from "@/lib/admin-table-pagination";
import { Button, ButtonLink } from "./button";
import { cx } from "./utils";
import { useViewportTablePageSize } from "./use-viewport-table-page-size";

type PaginationProps = {
  className?: string;
  label?: string;
  nextHref?: string;
  onNext?: () => void;
  onPrevious?: () => void;
  page: number;
  pageCount: number;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  previousHref?: string;
};

function PageSizeNavigation({ paginationRef, page, pageSize }: { paginationRef: RefObject<HTMLElement | null>; page: number; pageSize: number }) {
  const router = useRouter();
  const updateSize = useCallback((size: number) => {
    if (size === pageSize) return;
    const url = new URL(window.location.href);
    url.searchParams.set("pageSize", String(size));
    url.searchParams.set("page", String(Math.floor((page - 1) * pageSize / size) + 1));
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }, [router, page, pageSize]);
  useViewportTablePageSize(paginationRef, updateSize);
  return null;
}

export function Pagination({
  className,
  label = "Pagination",
  nextHref,
  onNext,
  onPrevious,
  page,
  pageCount,
  pageSize,
  onPageSizeChange,
  previousHref
}: PaginationProps) {
  const paginationRef = useRef<HTMLElement>(null);
  useViewportTablePageSize(paginationRef, onPageSizeChange);
  const safePageCount = Math.max(1, pageCount);
  const currentPage = Math.min(Math.max(1, page), safePageCount);
  const previousDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= safePageCount;

  return (
    <nav ref={paginationRef} aria-label={label} className={cx("ui-pagination", className)}>
      {pageSize && !onPageSizeChange ? <PageSizeNavigation paginationRef={paginationRef} page={page} pageSize={pageSize} /> : null}
      {previousHref ? (
        <ButtonLink
          aria-disabled={previousDisabled}
          className="ui-pagination-action"
          href={tablePageHref(previousHref, pageSize)!}
          size="sm"
          variant="secondary">
          <ChevronLeft size={15} />
          <span>Previous</span>
        </ButtonLink>
      ) : (
        <Button
          aria-disabled={previousDisabled}
          className="ui-pagination-action"
          disabled={previousDisabled}
          onClick={onPrevious}
          size="sm"
          type="button"
          variant="secondary">
          <ChevronLeft size={15} />
          <span>Previous</span>
        </Button>
      )}
      <span aria-current="page" aria-label={`Page ${currentPage} of ${safePageCount}`} aria-live="polite" className="ui-pagination-status">
        {currentPage}
      </span>
      {nextHref ? (
        <ButtonLink
          aria-disabled={nextDisabled}
          className="ui-pagination-action"
          href={tablePageHref(nextHref, pageSize)!}
          size="sm"
          variant="secondary">
          <span>Next</span>
          <ChevronRight size={15} />
        </ButtonLink>
      ) : (
        <Button
          aria-disabled={nextDisabled}
          className="ui-pagination-action"
          disabled={nextDisabled}
          onClick={onNext}
          size="sm"
          type="button"
          variant="secondary">
          <span>Next</span>
          <ChevronRight size={15} />
        </Button>
      )}
    </nav>
  );
}
