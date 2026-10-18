import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";

test("session status changes refresh the catalog and leave the confirmation URL", async () => {
  const events: string[] = [];
  const writes: unknown[] = [];
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireAdmin: async (permission: string) => { events.push(permission); } },
    "@/lib/site": { getSiteSettings: async () => ({ siteId: "site-a" }) },
    "@/lib/prisma": { prisma: { service: { updateMany: async (query: unknown) => { writes.push(query); events.push("write"); } } } },
    "@/lib/admin-validation": { requiredText: z.string(), optionalStoredText: z.string() },
    "next/cache": { revalidatePath: (path: string) => { events.push(path); } },
    "next/navigation": { redirect: (path: string) => { events.push("redirect"); throw new Error(`redirect:${path}`); } }
  };
  const require = createRequire(import.meta.url);
  const actions: Record<string, (form: FormData) => Promise<void>> = {};
  const source = ts.transpileModule(readFileSync(new URL("../modules/scheduling/actions.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  runInNewContext(source, { exports: actions, require: (id: string) => id in mocks ? mocks[id] : id.startsWith("@/") ? {} : require(id), URLSearchParams });

  for (const isActive of [false, true]) {
    events.length = 0;
    const form = new FormData();
    form.set("id", "service-a");
    form.set("isActive", String(isActive));
    await assert.rejects(actions.toggleServiceAction(form), /^Error: redirect:\/admin\/modules\/services$/);
    assert.equal(events[0], "scheduling:manage");
    assert.equal(events[1], "write");
    assert(events.includes("/admin/modules/services"));
    assert.equal(events.at(-1), "redirect");
    assert.equal(JSON.stringify(writes.at(-1)), JSON.stringify({ where: { id: "service-a", siteId: "site-a" }, data: { isActive } }));
  }
});
