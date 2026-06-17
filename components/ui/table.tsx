import type { TableHTMLAttributes } from "react";
import { cx } from "./utils";

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cx("ui-table", className)} {...props} />;
}
