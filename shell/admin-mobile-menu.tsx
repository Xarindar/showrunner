"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function AdminMobileMenu({ children, fallbackTitle, routeKey }: { children: ReactNode; fallbackTitle: string; routeKey: string }) {
  const [header, setHeader] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const main = document.querySelector<HTMLElement>(".admin-main");
    if (!main) return;
    let current: HTMLElement | null | undefined;
    const update = () => {
      const next = Array.from(main.querySelectorAll<HTMLElement>("header:has(h1), .product-studio-header, [data-admin-page-header]"))
        .find(element => element.getClientRects().length > 0) ?? null;
      if (next === current) return;
      current?.removeAttribute("data-admin-menu-host");
      next?.setAttribute("data-admin-menu-host", "");
      current = next;
      setHeader(next);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(main, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      current?.removeAttribute("data-admin-menu-host");
    };
  }, [routeKey]);

  return header ? createPortal(children, header) : <header className="admin-mobile-bar"><strong className="brand">{fallbackTitle}</strong>{children}</header>;
}
