import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

test("unconfigured client links use the branded preparation page instead of legacy original downloads", async () => {
  const require = createRequire(import.meta.url);
  const exports: { default?: (props: object) => Promise<React.ReactElement> } = {};
  const mocks: Record<string, unknown> = {
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "next/image": { default: "img" },
    "@/lib/site": { getSiteSettings: async () => ({ enabledModuleIds: ["portfolio"], siteId: "site-a", businessName: "Photo Studio", logoImageUrl: "" }) },
    "@/lib/portfolio/access": { findActiveGalleryAccess: async () => ({}) },
    "@/lib/portfolio/purchases": { getProofSelection: async () => null, getClientSessionDelivery: async () => ({ title: "Family session", photos: [{ id: "photo", name: "private.jpg", download: "/private-original" }] }) },
    "@/modules/portfolio/proof-client": { ProofClient: "proof-client" },
    "@/modules/portfolio/api/proof-request": { proofTokenSchema: { safeParse: () => ({ success: true }) } },
    "@/modules/portfolio/proof-client.module.css": { default: { page: "gallery", header: "header", brand: "brand", downloads: "photos", summary: "footer" } }
  };
  const source = ts.transpileModule(readFileSync("app/proofs/[token]/page.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(source, { exports, require: (id: string) => mocks[id] ?? require(id) });
  const html = renderToStaticMarkup(await exports.default!({ params: Promise.resolve({ token: "private-token" }) }));
  assert.match(html, /Photo Studio/); assert.match(html, /Family session/);
  assert.match(html, /Photo selection is being prepared/);
  assert(!html.includes("private-original")); assert(!html.includes("private.jpg"));
});
