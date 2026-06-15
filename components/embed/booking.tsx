"use client";

import Script from "next/script";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef } from "react";

export type ShowrunnerBookingTheme = {
  accentColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  mutedColor?: string;
  primaryColor?: string;
  radius?: string;
  textColor?: string;
};

export type ShowrunnerBookingService = {
  id: string;
  name: string;
  slug: string;
  staff?: Array<{ id: string; name: string; title?: string | null }>;
};

export type ShowrunnerBookingSlot = {
  endsAt: string;
  label: string;
  resourceIds: string[];
  resourceNames: string[];
  staffId: string | null;
  staffName: string | null;
  startsAt: string;
};

export type ShowrunnerBookingResult = {
  calendarUrl?: string;
  endsAt?: string;
  formLinks?: Array<{
    description: string;
    href: string;
    isRequired: boolean;
    name: string;
  }>;
  id?: string;
  manageUrl?: string;
  serviceId?: string;
  staffId?: string | null;
  startsAt?: string;
  status?: string;
};

export type ShowrunnerBookingReadyDetail = {
  services: ShowrunnerBookingService[];
};

export type ShowrunnerBookingAvailabilityDetail = {
  date: string;
  serviceId: string;
  slots: ShowrunnerBookingSlot[];
};

export type ShowrunnerBookingCreatedDetail = {
  booking: ShowrunnerBookingResult | null;
};

export type ShowrunnerBookingErrorDetail = {
  message: string;
};

export type ShowrunnerBookingProps = {
  apiBase?: string;
  className?: string;
  id?: string;
  onAvailability?: (detail: ShowrunnerBookingAvailabilityDetail) => void;
  onBookingCreated?: (detail: ShowrunnerBookingCreatedDetail) => void;
  onError?: (detail: ShowrunnerBookingErrorDetail) => void;
  onReady?: (detail: ShowrunnerBookingReadyDetail) => void;
  publishableKey: string;
  scriptId?: string;
  scriptSrc?: string;
  scriptStrategy?: "afterInteractive" | "lazyOnload";
  serviceId?: string;
  serviceSlug?: string;
  staffId?: string;
  style?: CSSProperties;
  theme?: ShowrunnerBookingTheme;
};

type CallbackRefs = Pick<ShowrunnerBookingProps, "onAvailability" | "onBookingCreated" | "onError" | "onReady">;

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function setOrRemoveAttribute(element: HTMLElement, name: string, value: string | undefined) {
  if (value) {
    element.setAttribute(name, value);
  } else {
    element.removeAttribute(name);
  }
}

function eventDetail<T>(event: Event) {
  return (event as CustomEvent<T>).detail;
}

export function ShowrunnerBooking({
  apiBase,
  className,
  id,
  onAvailability,
  onBookingCreated,
  onError,
  onReady,
  publishableKey,
  scriptId = "showrunner-booking-web-component",
  scriptSrc,
  scriptStrategy = "afterInteractive",
  serviceId,
  serviceSlug,
  staffId,
  style,
  theme
}: ShowrunnerBookingProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  const callbacksRef = useRef<CallbackRefs>({});
  const resolvedApiBase = apiBase ? trimTrailingSlash(apiBase) : "";
  const resolvedScriptSrc = scriptSrc || `${resolvedApiBase}/embed/v1/booking.js`;
  const themeJson = useMemo(() => (theme ? JSON.stringify(theme) : undefined), [theme]);

  useEffect(() => {
    callbacksRef.current = {
      onAvailability,
      onBookingCreated,
      onError,
      onReady
    };
  }, [onAvailability, onBookingCreated, onError, onReady]);

  useEffect(() => {
    if (!containerRef.current || elementRef.current) return;

    const element = document.createElement("showrunner-booking");
    const handleReady = (event: Event) => callbacksRef.current.onReady?.(eventDetail<ShowrunnerBookingReadyDetail>(event));
    const handleAvailability = (event: Event) =>
      callbacksRef.current.onAvailability?.(eventDetail<ShowrunnerBookingAvailabilityDetail>(event));
    const handleCreated = (event: Event) =>
      callbacksRef.current.onBookingCreated?.(eventDetail<ShowrunnerBookingCreatedDetail>(event));
    const handleError = (event: Event) => callbacksRef.current.onError?.(eventDetail<ShowrunnerBookingErrorDetail>(event));

    element.addEventListener("showrunner:ready", handleReady);
    element.addEventListener("showrunner:availability", handleAvailability);
    element.addEventListener("showrunner:booking-created", handleCreated);
    element.addEventListener("showrunner:error", handleError);
    containerRef.current.appendChild(element);
    elementRef.current = element;

    return () => {
      element.removeEventListener("showrunner:ready", handleReady);
      element.removeEventListener("showrunner:availability", handleAvailability);
      element.removeEventListener("showrunner:booking-created", handleCreated);
      element.removeEventListener("showrunner:error", handleError);
      element.remove();
      elementRef.current = null;
    };
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    setOrRemoveAttribute(element, "publishable-key", publishableKey);
    setOrRemoveAttribute(element, "api-base", resolvedApiBase);
    setOrRemoveAttribute(element, "service-id", serviceId);
    setOrRemoveAttribute(element, "service-slug", serviceSlug);
    setOrRemoveAttribute(element, "staff-id", staffId);
    setOrRemoveAttribute(element, "theme", themeJson);
  }, [publishableKey, resolvedApiBase, serviceId, serviceSlug, staffId, themeJson]);

  return (
    <>
      <Script id={scriptId} src={resolvedScriptSrc} strategy={scriptStrategy} />
      <div className={className} data-showrunner-booking-wrapper="" id={id} ref={containerRef} style={style} />
    </>
  );
}
