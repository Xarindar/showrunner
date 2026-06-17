import type { HTMLAttributes } from "react";
import { cx } from "./utils";

export function Tabs({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("ui-tabs", className)} role="tablist" {...props} />;
}

export function Tab({ className, ...props }: HTMLAttributes<HTMLButtonElement>) {
  return <button className={cx("ui-tab", className)} role="tab" type="button" {...props} />;
}
