(function () {
  "use strict";
  const channel = "showrunner-editor-v1";
  const script = document.currentScript;
  const allowedOrigins = (script?.dataset.editorOrigins || "").split(",").filter(Boolean);
  const editing = window.parent !== window && new URLSearchParams(location.search).get("showrunner-editor") === "1";
  let parentOrigin = "";
  let blocks = [];
  const rendered = new Map();
  const documentReady = document.readyState === "loading" ? new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true })) : Promise.resolve();
  const safeUrl = (value, base) => {
    try { const url = new URL(String(value || ""), base || location.href); return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
  };
  function apply(items, assetOrigin) {
    const changed = [];
    items.forEach(block => {
      const stamp = JSON.stringify(block.payload);
      if (rendered.get(block.id) === stamp) return;
      rendered.set(block.id, stamp);
      changed.push(block);
      (block.presentation?.bindings || []).forEach(binding => {
        const value = binding.path.split(".").reduce((value, key) => value?.[key], block.payload);
        if (typeof value !== "string") return;
        document.querySelectorAll(binding.selector).forEach(node => {
          const base = value.startsWith("/") ? assetOrigin : block.presentation.assetBaseUrl || location.href;
          if (!binding.attribute) { node.textContent = value; if (value.includes("\n")) node.style.whiteSpace = "pre-line"; }
          else if (binding.attribute === "background") node.style.backgroundImage = value ? `url(${JSON.stringify(safeUrl(value, base))})` : "none";
          else if (binding.attribute === "alt") node.setAttribute(node.tagName === "IMG" ? "alt" : "aria-label", value);
          else if (["src", "href"].includes(binding.attribute)) {
            node.setAttribute(binding.attribute, value ? safeUrl(value, binding.attribute === "href" ? location.href : base) : "");
            if (binding.attribute === "src") { node.removeAttribute("srcset"); node.closest("picture")?.querySelectorAll("source").forEach(source => source.removeAttribute("srcset")); }
          }
        });
      });
      if (block.type === "seo") {
        if (block.payload.title) document.title = block.payload.title;
        const meta = document.querySelector('meta[name="description"]');
        if (meta) meta.content = block.payload.description || "";
      }
    });
    if (changed.length) window.dispatchEvent(new CustomEvent("showrunner:render", { detail: { blocks: changed } }));
  }
  window.addEventListener("showrunner:content", event => apply(event.detail.blocks || [], script?.src ? new URL(script.src).origin : location.origin));
  if (!editing) return;
  const style = document.createElement("style");
  style.textContent = '[data-sr-section]{cursor:pointer;outline-offset:-2px}[data-sr-section]:hover{outline:2px solid #337cba}[data-sr-selected]{outline:2px solid #1561a0!important}[data-sr-section]:focus-visible{outline:3px solid #1561a0}';
  document.head.append(style);
  function send(type, extra) { if (parentOrigin) parent.postMessage({ channel, type, ...extra }, parentOrigin); }
  window.addEventListener("message", async event => {
    if (event.source !== parent || !allowedOrigins.includes(event.origin) || event.data?.channel !== channel) return;
    if (event.data.type === "connect") {
      parentOrigin = event.origin;
      await documentReady;
      await (window.showrunnerContentReady || Promise.resolve());
      send("ready");
    }
    if (event.data.type !== "update" || event.origin !== parentOrigin || !Array.isArray(event.data.blocks)) return;
    blocks = event.data.blocks;
    apply(blocks, event.origin);
    if (event.data.focusedItem) window.dispatchEvent(new CustomEvent("showrunner:focus-item", { detail: { id: event.data.focusedItem } }));
    document.querySelectorAll("[data-sr-selected]").forEach(node => node.removeAttribute("data-sr-selected"));
    blocks.forEach(block => {
      if (!block.presentation?.selector) return;
      document.querySelectorAll(block.presentation.selector).forEach(node => {
        node.dataset.srSection = block.id;
        node.tabIndex = 0;
        node.setAttribute("aria-label", `Edit ${block.id.replaceAll("-", " ")}`);
        if (block.id === event.data.selectedId) node.dataset.srSelected = "";
      });
    });
  });
  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : event.target.parentElement;
    if (!target) return;
    const section = target.closest("[data-sr-section]");
    const navigation = target.closest('nav,[role="navigation"]');
    const button = target.closest("button");
    const controlled = button?.getAttribute("aria-controls");
    // Menus retain their native click handlers, including menus within editable headers.
    if (button && (navigation || (controlled && document.getElementById(controlled)?.matches('nav,[role="navigation"]')))) return;
    const link = target.closest("a[href]");
    if (link && (navigation || !section)) {
      const url = new URL(link.href, location.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search && url.hash) return;
      event.preventDefault();
      send("navigate", { href: url.href });
      return;
    }
    // Content clicks select a section; live form actions stay disabled.
    if (section || link || button?.type === "submit") { event.preventDefault(); event.stopImmediatePropagation(); }
    if (section) send("select", { id: section.dataset.srSection });
  }, true);
  document.addEventListener("submit", event => { event.preventDefault(); event.stopImmediatePropagation(); }, true);
  document.addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-sr-section]")) { event.preventDefault(); send("select", { id: event.target.dataset.srSection }); }
  });
})();
