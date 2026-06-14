"use client";

import Script from "next/script";
import type { ComponentProps } from "react";
import { useEffect } from "react";
import type { AnalyticsEcommerceEvent, AnalyticsEcommerceItem } from "@/lib/analytics/ecommerce";

type PublicAnalyticsBootstrapProps = {
  consent: string;
  ga4MeasurementId: string;
  googleAdsTagId: string;
  metaPixelId: string;
};

type AddToCartAnalyticsData = {
  categories?: string[];
  currency: string;
  productId: string;
  productName: string;
  variants: Array<{
    id: string;
    name: string;
    priceCents: number;
  }>;
};

type BeginCheckoutAnalyticsData = {
  coupon?: string;
  currency: string;
  items: AnalyticsEcommerceItem[];
  totalCents: number;
};

type TrackedAnalyticsFormProps = Omit<ComponentProps<"form">, "action"> & {
  action: (formData: FormData) => void | Promise<void>;
  analyticsData: string;
  mode: "add_to_cart" | "begin_checkout";
};

type TrackAnalyticsEventProps = {
  event: AnalyticsEcommerceEvent;
  onceKey?: string;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

const firedEvents = new Set<string>();

function gaPayload(event: AnalyticsEcommerceEvent) {
  return {
    coupon: event.coupon,
    currency: event.currency,
    items: event.items,
    transaction_id: event.transaction_id,
    value: event.value
  };
}

function metaContents(items: AnalyticsEcommerceItem[]) {
  return items.map((item) => ({
    id: item.item_id,
    item_price: item.price,
    quantity: item.quantity
  }));
}

function trackMetaEvent(event: AnalyticsEcommerceEvent) {
  if (!window.fbq) return;

  const contentIds = event.items.map((item) => item.item_id);
  const commonPayload = {
    content_ids: contentIds,
    content_type: "product",
    contents: metaContents(event.items),
    currency: event.currency,
    value: event.value
  };

  if (event.eventName === "view_item") {
    window.fbq("track", "ViewContent", commonPayload);
    return;
  }

  if (event.eventName === "add_to_cart") {
    window.fbq("track", "AddToCart", commonPayload);
    return;
  }

  if (event.eventName === "begin_checkout") {
    window.fbq("track", "InitiateCheckout", commonPayload);
    return;
  }

  if (event.eventName === "purchase") {
    window.fbq("track", "Purchase", {
      ...commonPayload,
      order_id: event.transaction_id
    });
  }
}

export function trackAnalyticsEvent(event: AnalyticsEcommerceEvent) {
  if (typeof window === "undefined") return;

  if (window.gtag) {
    window.gtag("event", event.eventName, gaPayload(event));
  }

  trackMetaEvent(event);
}

function formEvent(mode: TrackedAnalyticsFormProps["mode"], formData: FormData, analyticsData: string) {
  if (mode === "begin_checkout") {
    const checkout = JSON.parse(analyticsData) as BeginCheckoutAnalyticsData;

    return {
      coupon: checkout.coupon,
      currency: checkout.currency,
      eventName: "begin_checkout" as const,
      items: checkout.items,
      value: Number((checkout.totalCents / 100).toFixed(2))
    };
  }

  const product = JSON.parse(analyticsData) as AddToCartAnalyticsData;
  const variantId = String(formData.get("variantId") || product.variants[0]?.id || "");
  const quantity = Math.max(1, Number(formData.get("quantity") || 1) || 1);
  const variant = product.variants.find((candidate) => candidate.id === variantId) || product.variants[0];

  if (!variant) return null;

  return {
    currency: product.currency,
    eventName: "add_to_cart" as const,
    items: [
      {
        item_category: product.categories?.[0],
        item_category2: product.categories?.[1],
        item_id: product.productId,
        item_name: product.productName,
        item_variant: variant.name || undefined,
        price: Number((variant.priceCents / 100).toFixed(2)),
        quantity
      }
    ],
    value: Number(((variant.priceCents * quantity) / 100).toFixed(2))
  };
}

export function PublicAnalyticsBootstrap({
  consent,
  ga4MeasurementId,
  googleAdsTagId,
  metaPixelId
}: PublicAnalyticsBootstrapProps) {
  if (consent === "denied") return null;

  const primaryGoogleTagId = ga4MeasurementId || googleAdsTagId;

  return (
    <>
      {primaryGoogleTagId ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${primaryGoogleTagId}`} strategy="afterInteractive" />
          <Script id="showrunner-gtag-init" strategy="afterInteractive">{`
            window.dataLayer = window.dataLayer || [];
            window.gtag = window.gtag || function(){window.dataLayer.push(arguments);};
            window.gtag('js', new Date());
            ${ga4MeasurementId ? `window.gtag('config', '${ga4MeasurementId}', { send_page_view: false });` : ""}
            ${googleAdsTagId ? `window.gtag('config', '${googleAdsTagId}', { send_page_view: false });` : ""}
          `}</Script>
        </>
      ) : null}
      {metaPixelId ? (
        <Script id="showrunner-meta-pixel" strategy="afterInteractive">{`
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${metaPixelId}');
        `}</Script>
      ) : null}
    </>
  );
}

export function TrackAnalyticsEvent({ event, onceKey }: TrackAnalyticsEventProps) {
  useEffect(() => {
    const eventKey = onceKey || JSON.stringify(event);
    if (firedEvents.has(eventKey)) return;
    firedEvents.add(eventKey);
    trackAnalyticsEvent(event);
  }, [event, onceKey]);

  return null;
}

export function TrackedAnalyticsForm({ action, analyticsData, mode, onSubmit, ...props }: TrackedAnalyticsFormProps) {
  return (
    <form
      {...props}
      action={action}
      onSubmit={(event) => {
        const trackedEvent = formEvent(mode, new FormData(event.currentTarget), analyticsData);
        if (trackedEvent) trackAnalyticsEvent(trackedEvent);
        onSubmit?.(event);
      }}
    />
  );
}
