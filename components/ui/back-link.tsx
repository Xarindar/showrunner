"use client";

import type { ComponentProps } from "react";
import { ButtonLink } from "./button";

export function BackLink({ onClick, ...props }: ComponentProps<typeof ButtonLink>) {
  return <ButtonLink {...props} onClick={event => {
    onClick?.(event);
    if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  }} />;
}
