"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

export type AdminMobileHeaderContext = {
  backHref: string;
  title: string;
};

type Listener = () => void;

const listeners = new Set<Listener>();
const entries = new Map<symbol, AdminMobileHeaderContext>();
let currentContext: AdminMobileHeaderContext | null = null;

function publish() {
  currentContext = Array.from(entries.values()).at(-1) ?? null;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return currentContext;
}

export function useAdminMobileHeaderContext() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function AdminMobileHeaderSlot({ backHref, title }: AdminMobileHeaderContext) {
  useLayoutEffect(() => {
    const key = Symbol("admin-mobile-header");

    entries.set(key, { backHref, title });
    publish();

    return () => {
      entries.delete(key);
      publish();
    };
  }, [backHref, title]);

  return null;
}
