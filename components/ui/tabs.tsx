import type { ComponentPropsWithoutRef, HTMLAttributes } from "react";
import Link from "next/link";
import { cx } from "./utils";

export function Tabs({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("ui-tabs", className)} role="tablist" {...props} />;
}

export function Tab({ className, ...props }: HTMLAttributes<HTMLButtonElement>) {
  return <button className={cx("ui-tab", className)} role="tab" type="button" {...props} />;
}

export function TabLink({ className, ...props }: ComponentPropsWithoutRef<typeof Link>) {
  return <Link className={cx("ui-tab", className)} role="tab" {...props} />;
}
