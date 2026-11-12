import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("session detail routes scope galleries to their client booking and reject unavailable targets", async () => {
  const require = createRequire(import.meta.url);
  const source = readFileSync("app/admin/(protected)/clients/[id]/sessions/[sessionId]/page.tsx", "utf8");
  const workspace = { sessions: [{ id: "booking-a" }, { id: "booking-b" }], galleries: [{ id: "gallery-a", bookingId: "booking-a" }, { id: "gallery-b", bookingId: "booking-b" }] };
  const exported: { default?: (props: object) => Promise<{ props: { initialWorkspace: typeof workspace; initialBookingId: string; initialGalleryId: string; openUpload: boolean } }> } = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports: exported, require: (id: string) => {
    if (id === "next/navigation") return { notFound: () => { throw new Error("NOT_FOUND"); } };
    if (id === "@/modules/portfolio/client-actions") return { getClientGalleryWorkspace: async (clientId: string) => { assert.equal(clientId, "client-a"); return workspace; } };
    if (id === "@/modules/clients/detail/client-galleries-card") return { ClientSessionDetail: "detail" };
    return require(id);
  } });
  const open = (sessionId: string) => exported.default!({ params: Promise.resolve({ id: "client-a", sessionId }), searchParams: Promise.resolve({ upload: "1" }) });
  const page = await open("booking-a");
  assert.equal(page.props.initialGalleryId, "gallery-a"); assert.equal(page.props.initialBookingId, "booking-a"); assert.equal(page.props.openUpload, true);
  assert.equal(page.props.initialWorkspace.galleries.length, 1); assert.equal(page.props.initialWorkspace.galleries[0].id, "gallery-a");
  assert.equal((await open("gallery-b")).props.initialGalleryId, "gallery-b");
  await assert.rejects(open("foreign-gallery"), /NOT_FOUND/);
});
