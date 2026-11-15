import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

async function exportPage(allowed = true) {
  const exports: { GET?: (r: Request) => Promise<Response> } = {};
  const mocks: Record<string, unknown> = {
    "@/modules/portfolio/api/proof-bundle": { bundleUnavailable: () => new Response("Unavailable", { status: 404 }), proofBundleHeaders: { "Cache-Control": "private, no-store" } },
    "@/modules/portfolio/api/proof-export": { exportSelection: async () => allowed ? {} : null }
  };
  const source = ts.transpileModule(readFileSync("app/proof-export/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(source, { exports, Response, URL, URLSearchParams, require: (name: string) => mocks[name] });
  return exports.GET!(new Request("https://photos.example/proof-export?access=test&purchase=test&expires=300&signature=test"));
}

test("Drive export preserves authorization and does not cache signed links", async () => {
  assert.equal((await exportPage(false)).status, 404);
  assert.equal((await exportPage()).headers.get("cache-control"), "private, no-store");
});

test("Drive status reports load failures and expiry without destroying an in-progress widget", async () => {
  const html = await (await exportPage()).text();
  assert.match(html, /id="drive-status" role="status"/);
  assert.doesNotMatch(html, /opacity:0|overflow:hidden/);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  let now = 0, rendered = false;
  const status = { textContent: "" };
  const widget = { inert: false, querySelector: () => rendered ? {} : null };
  let tick = () => {}, timeout = () => {}, visibility = () => {};
  const context = {
    document: { getElementById: (id: string) => id === "drive-status" ? status : widget,
      addEventListener: (_event: string, cb: () => void) => { visibility = cb; } },
    Date: { now: () => now },
    setInterval: (cb: () => void) => { tick = cb; },
    setTimeout: (cb: () => void) => { timeout = cb; }
  };
  runInNewContext(script, context);
  timeout();
  assert.match(status.textContent, /could not load/);
  status.textContent = "Waiting for Google";
  rendered = true;
  timeout();
  assert.equal(status.textContent, "Waiting for Google");
  now = 299999; tick();
  assert.equal(widget.inert, false);
  now = 300000; visibility();
  assert.equal(widget.inert, true);
  assert.match(status.textContent, /expired/);
  assert.match(status.textContent, /Refresh Drive link/);
  assert.equal(rendered, true);
});
