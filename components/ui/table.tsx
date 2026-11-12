import type { TableHTMLAttributes } from "react";
import { cx } from "./utils";
import { ResponsiveTableFrame } from "./responsive-table";

type TableProps = TableHTMLAttributes<HTMLTableElement> & {
  tableClassName?: string;
  mobileLayout?: "cards" | "columns";
};

export function Table({ className, tableClassName, mobileLayout, ...props }: TableProps) {
  return (
    <ResponsiveTableFrame mobileLayout={mobileLayout} className={cx("ui-table-wrap", className)} tabIndex={0} role="region" aria-label={props["aria-label"] || "Scrollable table"}>
      <table className={cx("ui-table", tableClassName)} {...props} />
    </ResponsiveTableFrame>
  );
}
