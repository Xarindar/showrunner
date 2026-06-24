import { ChevronLeft, ChevronRight } from "lucide-react";
import { ButtonLink } from "./button";
import { cx } from "./utils";

type PaginationProps = {
  className?: string;
  label?: string;
  nextHref: string;
  page: number;
  pageCount: number;
  previousHref: string;
};

export function Pagination({
  className,
  label = "Pagination",
  nextHref,
  page,
  pageCount,
  previousHref
}: PaginationProps) {
  const safePageCount = Math.max(1, pageCount);
  const currentPage = Math.min(Math.max(1, page), safePageCount);

  return (
    <nav aria-label={label} className={cx("ui-pagination", className)}>
      <ButtonLink
        aria-disabled={currentPage <= 1}
        className="ui-pagination-action"
        href={previousHref}
        size="sm"
        variant="secondary"
      >
        <ChevronLeft size={15} />
        <span>Previous</span>
      </ButtonLink>
      <span aria-current="page" aria-label={`Page ${currentPage} of ${safePageCount}`} aria-live="polite" className="ui-pagination-status">
        {currentPage}
      </span>
      <ButtonLink
        aria-disabled={currentPage >= safePageCount}
        className="ui-pagination-action"
        href={nextHref}
        size="sm"
        variant="secondary"
      >
        <span>Next</span>
        <ChevronRight size={15} />
      </ButtonLink>
    </nav>
  );
}
