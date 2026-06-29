import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, ButtonLink } from "./button";
import { cx } from "./utils";

type PaginationProps = {
  className?: string;
  label?: string;
  nextHref?: string;
  onNext?: () => void;
  onPrevious?: () => void;
  page: number;
  pageCount: number;
  previousHref?: string;
};

export function Pagination({
  className,
  label = "Pagination",
  nextHref,
  onNext,
  onPrevious,
  page,
  pageCount,
  previousHref
}: PaginationProps) {
  const safePageCount = Math.max(1, pageCount);
  const currentPage = Math.min(Math.max(1, page), safePageCount);
  const previousDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= safePageCount;

  return (
    <nav aria-label={label} className={cx("ui-pagination", className)}>
      {previousHref ? (
        <ButtonLink
          aria-disabled={previousDisabled}
          className="ui-pagination-action"
          href={previousHref}
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
          href={nextHref}
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
