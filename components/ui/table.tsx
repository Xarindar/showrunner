import type { TableHTMLAttributes } from "react";
import { cx } from "./utils";

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className={cx("ui-table-wrap", className)}>
      <table className="ui-table" {...props} />
    </div>
  );
}
