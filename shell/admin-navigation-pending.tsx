"use client";

import { useLinkStatus } from "next/link";

export function AdminNavigationPending() {
  const { pending } = useLinkStatus();
  return <span className="admin-navigation-pending" data-pending={pending} role="status">
    {pending ? <span className="ui-sr-only">Loading page…</span> : null}
  </span>;
}
