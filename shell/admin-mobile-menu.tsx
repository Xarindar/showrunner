"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";

export function AdminMobileMenu({ children, fallbackTitle, routeKey }: { children: ReactNode; fallbackTitle: string; routeKey: string }) {
  const [detailPage, setDetailPage] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const anchored = position !== null;
  useLayoutEffect(() => {
    const main = document.querySelector<HTMLElement>(".admin-main");
    if (!main) return;
    let current: HTMLElement | null = null;
    const resize = new ResizeObserver(() => update());
    const update = () => {
      const next = Array.from(main.querySelectorAll<HTMLElement>("header:has(h1), .product-studio-header, [data-admin-page-header]"))
        .find(element => element.getClientRects().length > 0) ?? null;
      setDetailPage(Boolean(main.querySelector(".has-mobile-shell-header")) || Boolean(next?.querySelector("a[href] svg.lucide-arrow-left")));
      if (next !== current) {
        if (current) resize.unobserve(current);
        if (next) resize.observe(next);
        current = next;
      }
      const bounds = next?.getBoundingClientRect();
      const title = next?.querySelector<HTMLElement>(".appointments-subtle-title")?.getBoundingClientRect() ?? bounds;
      const nextPosition = bounds && title ? { top: title.top + title.height / 2, right: innerWidth - bounds.right } : null;
      setPosition(previous => previous?.top === nextPosition?.top && previous?.right === nextPosition?.right ? previous : nextPosition);
    };
    update();
    resize.observe(main);
    const observer = new MutationObserver(update);
    observer.observe(main, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [routeKey, anchored, detailPage]);

  // Page headers may still be hydrating: anchor beside them without changing their DOM.
  return detailPage ? null : position ? <div className="admin-page-menu-anchor" style={position}>{children}</div> : <header className="admin-mobile-bar"><strong className="brand">{fallbackTitle}</strong>{children}</header>;
}
