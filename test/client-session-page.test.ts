import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("new session prefills only a client available in the scoped client list", async () => {
  const require = createRequire(import.meta.url);
  const clients = [{ id: "client-a", name: "Abe", email: "abe@example.test", phone: null }];
  const exported: { default?: (props: object) => Promise<{ props: { initialClientId?: string; clients: typeof clients } }> } = {};
  const source = readFileSync("modules/appointments/new-page.tsx", "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports: exported, require: (id: string) => {
    if (id === "next/navigation") return { notFound: () => { throw new Error("NOT_FOUND"); } };
    if (id === "@/lib/auth") return { requireAdmin: async (permission: string) => { assert.equal(permission, "appointments:manage"); return {}; }, resolveDataScopeMode: async () => "ALL", getAccessibleClientWhere: async () => ({ siteId: "site-a", id: { in: ["client-a"] } }) };
    if (id === "@/lib/site") return { getSiteSettings: async () => ({ siteId: "site-a", timezone: "America/Chicago" }) };
    if (id === "@/lib/prisma") return { prisma: {
      service: { findMany: async () => [] }, staffMember: { findMany: async () => [] }, hourlyRate: { findMany: async () => [] },
      client: { findMany: async ({ where }: { where: { siteId: string; id: { in: string[] } } }) => { assert.equal(where.siteId, "site-a"); assert.equal(where.id.in[0], "client-a"); return clients; } }
    } };
    if (id === "./session-form") return { SessionForm: "form" };
    return require(id);
  } });
  const open = (clientId?: string) => exported.default!({ searchParams: Promise.resolve({ clientId }) });
  assert.equal((await open("client-a")).props.initialClientId, "client-a");
  assert.equal((await open()).props.initialClientId, undefined);
  await assert.rejects(open("foreign-client"), /NOT_FOUND/);
});

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


test("legacy client uploads opens the Clients folder in Media with Media permission", async () => {
  const require = createRequire(import.meta.url);
  const exported: { default?: () => Promise<void> } = {};
  const source = readFileSync("modules/uploads/page.tsx", "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exported, require: (id: string) => {
    if (id === "@/lib/auth") return { requireAdmin: async (permission: string) => assert.equal(permission, "media:manage") };
    if (id === "next/navigation") return { redirect: (href: string) => { throw new Error(href); } };
    return require(id);
  } });
  await assert.rejects(exported.default!(), /\/admin\/modules\/media\?folder=Clients/);
});
