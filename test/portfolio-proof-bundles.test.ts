import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("the background worker writes both selected originals with safe, unique names", async () => {
  const file = "lib/portfolio/proof-bundles.ts";
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const require = createRequire(import.meta.url);
  const exports: { processProofBundles?: () => Promise<void> } = {};
  const keys: string[] = [];
  const outputs: Buffer[] = [];
  const job = { purchaseId: "purchase", accessId: "access", purchase: { siteId: "site" }, state: "QUEUED" };
  const selection = { purchaseId: "purchase", accessId: "access", assets: ["original-a", "original-b"].map((key, index) => ({
    asset: { key, driver: "S3", filename: index === 0 ? "Abe Giorgio-2026-11-13-3140acf3ed12.jpg" : "../portrait.jpg" }
  })) };
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "@/lib/prisma": { prisma: {
      portfolioProofBundle: { findFirst: async () => ({ ...job }), updateMany: async ({ data }: { data: object }) => { Object.assign(job, data); return { count: 1 }; } },
      portfolioGalleryAccess: { findUnique: async () => ({ accessToken: "private-test-token" }) }
    } },
    "./purchases": { getReleasedProofBundle: async () => selection, proofArchivePrefix: "proof-zips/v2/" },
    "@/lib/media": { openPrivateOriginal: async ({ key }: { key: string }) => {
      keys.push(key); return Readable.from([Buffer.from(key)]);
    }, storeProofArchive: async (_driver: string, _key: string, archive: Readable) => {
      for await (const chunk of archive) outputs.push(Buffer.from(chunk));
    } }
  };
  runInNewContext(source, { exports, Buffer, AbortController, setTimeout, clearTimeout, require: (name: string) => mocks[name] ?? require(name) });
  await exports.processProofBundles!();
  assert.equal(job.state, "READY");
  assert.deepEqual(keys, ["original-a", "original-b"]);
  const zip = Buffer.concat(outputs);
  const contents = new Map<string, string>();
  for (let offset = zip.indexOf(Buffer.from([0x50, 0x4b, 3, 4])); offset !== -1; offset = zip.indexOf(Buffer.from([0x50, 0x4b, 3, 4]), offset + 4)) {
    const length = zip.readUInt16LE(offset + 26);
    const start = offset + 30;
    const payload = start + length + zip.readUInt16LE(offset + 28);
    contents.set(zip.toString("utf8", start, start + length), zip.toString("utf8", payload, payload + 10));
  }
  assert.deepEqual([...contents], [["001-Abe Giorgio-2026-11-13.jpg", "original-a"], ["002-.._portrait.jpg", "original-b"]]);
  assert.notEqual(zip.indexOf(Buffer.from([0x50, 0x4b, 5, 6])), -1);
});
