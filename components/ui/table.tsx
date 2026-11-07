import type { TableHTMLAttributes } from "react";
import { cx } from "./utils";
import { ResponsiveTableFrame } from "./responsive-table";

type TableProps = TableHTMLAttributes<HTMLTableElement> & {
  tableClassName?: string;
};

export function Table({ className, tableClassName, ...props }: TableProps) {
  return (
    <ResponsiveTableFrame className={cx("ui-table-wrap", className)} tabIndex={0} role="region" aria-label={props["aria-label"] || "Scrollable table"}>
      <table className={cx("ui-table", tableClassName)} {...props} />
    </ResponsiveTableFrame>
  );
}
