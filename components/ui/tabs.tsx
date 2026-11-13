"use client";

import { useLayoutEffect, useRef, type HTMLAttributes } from "react";
import { cx } from "./utils";

export function Tabs({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const root = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const track = root.current;
    const pill = indicator.current;
    if (!track || !pill) return;
    const measure = () => {
      const selected = track.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (!selected) { delete track.dataset.indicator; return; }
      Object.assign(pill.style, {
        transform: `translateX(${selected.offsetLeft}px)`,
        top: `${selected.offsetTop}px`,
        width: `${selected.offsetWidth}px`,
        height: `${selected.offsetHeight}px`
      });
      track.dataset.indicator = "true";
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [children]);
  return <div ref={root} className={cx("ui-tabs", className)} role="tablist" {...props}>
    <span ref={indicator} className="ui-tabs-indicator" aria-hidden="true" />
    {children}
  </div>;
}

export function Tab({ className, ...props }: HTMLAttributes<HTMLButtonElement>) {
  return <button className={cx("ui-tab", className)} role="tab" type="button" {...props} />;
}
