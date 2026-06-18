import type { TableHTMLAttributes } from "react";
import { cx } from "./utils";

type TableProps = TableHTMLAttributes<HTMLTableElement> & {
  tableClassName?: string;
};

export function Table({ className, tableClassName, ...props }: TableProps) {
  return (
    <div className={cx("ui-table-wrap", className)}>
      <table className={cx("ui-table", tableClassName)} {...props} />
    </div>
  );
}
