import type { Metadata } from "next";

type EmbedBookingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type EmbedConfig = {
  id: string;
  parentOrigin: string;
};

const themeParamAttrs = [
  ["accentColor", "accent-color"],
  ["primaryColor", "primary-color"],
  ["backgroundColor", "background-color"],
  ["borderColor", "border-color"],
  ["mutedColor", "muted-color"],
  ["textColor", "text-color"],
  ["radius", "radius"]
] as const;

export const metadata: Metadata = {
  title: "Booking Embed",
  robots: {
    index: false,
    follow: false
  }
};

function firstParam(params: Record<string, string | string[] | undefined>, ...keys: string[]) {
  for (const key of keys) {
    const value = params[key];
    const text = Array.isArray(value) ? value[0] : value;
    if (typeof text === "string" && text.trim()) return text.trim();
  }
  return "";
}

function safeAttributeValue(value: string, maxLength = 500) {
  return value.slice(0, maxLength);
}

function safeHttpOrigin(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}

function safeApiBase(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function widgetAttributes(params: Record<string, string | string[] | undefined>) {
  const attrs: Record<string, string> = {};
  const publishableKey = firstParam(params, "key", "publishableKey", "publishable-key");
  const apiBase = safeApiBase(firstParam(params, "apiBase", "api-base"));
  const serviceId = firstParam(params, "serviceId", "service-id");
  const serviceSlug = firstParam(params, "serviceSlug", "service-slug");
  const staffId = firstParam(params, "staffId", "staff-id");
  const theme = firstParam(params, "theme");

  if (publishableKey) attrs["publishable-key"] = safeAttributeValue(publishableKey, 120);
  if (apiBase) attrs["api-base"] = apiBase;
  if (serviceId) attrs["service-id"] = safeAttributeValue(serviceId, 120);
  if (!serviceId && serviceSlug) attrs["service-slug"] = safeAttributeValue(serviceSlug, 160);
  if (staffId) attrs["staff-id"] = safeAttributeValue(staffId, 120);
  if (theme) attrs.theme = safeAttributeValue(theme, 2000);

  for (const [param, attr] of themeParamAttrs) {
    const value = firstParam(params, param, attr);
    if (value) attrs[attr] = safeAttributeValue(value, 80);
  }

  return attrs;
}

function widgetMarkup(attrs: Record<string, string>) {
  const attrText = Object.entries(attrs)
    .map(([key, value]) => `${key}="${escapeAttribute(value)}"`)
    .join(" ");
  return `<showrunner-booking${attrText ? ` ${attrText}` : ""}></showrunner-booking>`;
}

function serializeConfig(config: EmbedConfig) {
  return JSON.stringify(config).replace(/</g, "\\u003c");
}

function resizeBridgeScript(config: EmbedConfig) {
  return `
(function () {
  "use strict";
  var config = ${serializeConfig(config)};
  var targetOrigin = config.parentOrigin || "";
  function normalizedOrigin(value) {
    if (!value) return "";
    try {
      var url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" ? url.origin : "";
    } catch (_error) {
      return "";
    }
  }
  function resolveTargetOrigin() {
    if (targetOrigin) return targetOrigin;
    targetOrigin = normalizedOrigin(document.referrer);
    return targetOrigin;
  }
  function frameSize() {
    var body = document.body;
    var root = document.documentElement;
    return {
      height: Math.max(body ? body.scrollHeight : 0, body ? body.offsetHeight : 0, root ? root.scrollHeight : 0, root ? root.offsetHeight : 0),
      width: Math.max(body ? body.scrollWidth : 0, body ? body.offsetWidth : 0, root ? root.scrollWidth : 0, root ? root.offsetWidth : 0)
    };
  }
  function post(type, detail) {
    var origin = resolveTargetOrigin();
    if (!origin || window.parent === window) return;
    var size = frameSize();
    window.parent.postMessage({
      source: "showrunner",
      type: type,
      id: config.id || "",
      height: size.height,
      width: size.width,
      detail: detail || {}
    }, origin);
  }
  var scheduled = false;
  function scheduleResize() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(function () {
      scheduled = false;
      post("showrunner:booking:resize");
    });
  }
  window.addEventListener("load", scheduleResize);
  window.addEventListener("resize", scheduleResize);
  document.addEventListener("showrunner:ready", function (event) {
    post("showrunner:booking:ready", event.detail);
    scheduleResize();
  });
  document.addEventListener("showrunner:availability", scheduleResize);
  document.addEventListener("showrunner:booking-created", function (event) {
    post("showrunner:booking:created", event.detail);
    scheduleResize();
  });
  document.addEventListener("showrunner:error", function (event) {
    post("showrunner:booking:error", event.detail);
    scheduleResize();
  });
  if ("ResizeObserver" in window) {
    new ResizeObserver(scheduleResize).observe(document.documentElement);
  } else {
    window.setInterval(scheduleResize, 1000);
  }
  scheduleResize();
})();
`;
}

export default async function EmbedBookingPage({ searchParams }: EmbedBookingPageProps) {
  const params = searchParams ? await searchParams : {};
  const attrs = widgetAttributes(params);
  const config: EmbedConfig = {
    id: safeAttributeValue(firstParam(params, "id", "embedId", "embed-id"), 120),
    parentOrigin: safeHttpOrigin(firstParam(params, "parentOrigin", "parent-origin"))
  };

  return (
    <main className="embed-booking-page">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            html,body{background:#fff;margin:0;min-height:0;}
            body{background:#fff;}
            .embed-booking-page{background:#fff;color:#111827;margin:0;min-height:0;padding:0;}
            .embed-booking-shell{margin:0 auto;max-width:720px;padding:0;}
            showrunner-booking{display:block;width:100%;}
          `
        }}
      />
      <div className="embed-booking-shell" dangerouslySetInnerHTML={{ __html: widgetMarkup(attrs) }} />
      <script src="/embed/v1/booking.js" async />
      <script dangerouslySetInnerHTML={{ __html: resizeBridgeScript(config) }} />
    </main>
  );
}
