import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Button, ButtonAnchor } from "./button";
import { SelectMenu } from "./select-menu";
import { cx } from "./utils";

export type TableFilterSelect = {
  id: string;
  label: string;
  name: string;
  options: Array<{ label: string; value: string }>;
  value: string;
};

type TableFilterBarProps = {
  action: string;
  children?: ReactNode;
  className?: string;
  clearHref?: string;
  clearLabel?: string;
  hiddenInputs?: Array<{ name: string; value: string }>;
  selects?: TableFilterSelect[];
  searchId: string;
  searchName?: string;
  searchPlaceholder: string;
  searchValue?: string;
  showClear?: boolean;
  submitLabel?: string;
};

export function TableFilterBar({
  action,
  children,
  className,
  clearHref,
  clearLabel = "Reset",
  hiddenInputs = [],
  selects = [],
  searchId,
  searchName = "q",
  searchPlaceholder,
  searchValue = "",
  showClear,
  submitLabel = "Search"
}: TableFilterBarProps) {
  const shouldShowClear = Boolean(clearHref && (showClear ?? searchValue));

  return (
    <div className={cx("ui-table-filter-bar", className)}>
      <form action={action} className="ui-table-filter-search">
        {hiddenInputs.map((input) => (
          <input key={`${input.name}-${input.value}`} name={input.name} type="hidden" value={input.value} />
        ))}
        <label className="ui-sr-only" htmlFor={searchId}>
          {searchPlaceholder}
        </label>
        <span className="ui-table-filter-input">
          <Search aria-hidden="true" size={15} />
          <input id={searchId} name={searchName} placeholder={searchPlaceholder} defaultValue={searchValue} />
        </span>

        {selects.map((select) => (
          <SelectMenu
            className="ui-table-filter-select"
            id={select.id}
            key={select.id}
            label={select.label}
            name={select.name}
            options={select.options}
            value={select.value}
          />
        ))}

        <Button size="sm" type="submit" variant="secondary">
          {submitLabel}
        </Button>
        {shouldShowClear ? (
          <ButtonAnchor href={clearHref} size="sm" variant="ghost">
            <X size={15} />
            {clearLabel}
          </ButtonAnchor>
        ) : null}
      </form>

      {children ? <div className="ui-table-filter-extra">{children}</div> : null}
    </div>
  );
}
