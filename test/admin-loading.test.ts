import assert from "node:assert/strict";
import RootLoading from "../app/loading";
import test from "node:test";
import { adminLoadingRoute } from "../shell/admin-loading-route";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminTableSkeleton } from "../shell/admin-table-loading";
import { AdminSkeleton } from "../shell/loading-states";

test("loading follows static routes, aliases and nested editors", () => {
  for (const [path, kind] of [
    ["/admin", "workspace"], ["/admin/modules/services", "services"],
    ["/admin/scheduling", "services"], ["/admin/modules/services/categories", "workspace"],
    ["/admin/modules/services/packages", "packages"], ["/admin/modules/services/packages/example", "editor"],
    ["/admin/modules/services/example", "editor"], ["/admin/modules/products", "products"],
    ["/admin/modules/products/example/bundles", "editor"], ["/admin/clients", "clients"],
    ["/admin/clients/example", "editor"], ["/admin/modules/appointments", "calendar"],
    ["/admin/appointments/new", "editor"], ["/admin/content", "website"],
    ["/admin/modules/portfolio", "gallery"], ["/admin/media", "gallery"],
    ["/admin/modules/settings/modules", "editor"], ["/admin/modules/unknown", "workspace"]
  ]) assert.equal(adminLoadingRoute(path).kind, kind, path);
});

test("fallbacks announce the destination without exposing fake controls or old folder tabs", () => {
  for (const kind of ["clients", "products", "services", "packages"] as const) {
    const html = renderToStaticMarkup(createElement(AdminTableSkeleton, { kind }));
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /role="status"/);
    assert.doesNotMatch(html, /ui-folder|<button|<input|<main/);
  }
  for (const kind of ["editor", "website", "gallery", "workspace"] as const) {
    const html = renderToStaticMarkup(createElement(AdminSkeleton, { kind, title: "Example" }));
    assert.match(html, /Loading Example/);
    assert.doesNotMatch(html, /skeleton-card|<button|<input/);
  }
});


test("initial loading never flashes public branding or retired editor layouts", () => {
  const root = renderToStaticMarkup(createElement(RootLoading));
  assert.match(root, /role="status"/);
  assert.doesNotMatch(root, /site-nav|brand|skeleton/);
  const gallery = renderToStaticMarkup(createElement(AdminSkeleton, { kind: "gallery", title: "Media" }));
  assert.match(gallery, /admin-loading-toolbar/);
  assert.doesNotMatch(gallery, /admin-loading-gallery" aria-hidden|admin-loading-field|<aside/);
  const website = renderToStaticMarkup(createElement(AdminSkeleton, { kind: "website", title: "Content" }));
  assert.match(website, /admin-loading-preview/);
  assert.doesNotMatch(website, /admin-loading-settings|<aside/);
});
