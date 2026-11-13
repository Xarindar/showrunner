import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("automatic email delivery starts immediately, avoids overlap and recovers after errors", async () => {
  let calls = 0, unref = false;
  let tick!: () => void;
  let finish!: () => void;
  const errors: unknown[] = [];
  const exports: { startEmailOutbox?: () => void } = {};
  const source = ts.transpileModule(readFileSync("lib/email/maintenance.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(source, { exports, console: { error: (...args: unknown[]) => errors.push(args) },
    require: () => ({ processEmailOutbox: async () => { calls++; if (calls === 1) await new Promise<void>(resolve => { finish = resolve; }); if (calls === 2) throw new Error("Temporary database outage"); } }),
    setInterval: (callback: () => void, interval: number) => { assert.equal(interval, 60_000); tick = callback; return { unref: () => { unref = true; } }; }
  });
  exports.startEmailOutbox!();
  tick(); assert.equal(calls, 1); assert(unref);
  finish(); await new Promise(setImmediate);
  tick(); await new Promise(setImmediate); assert.equal(errors.length, 1);
  tick(); await new Promise(setImmediate); assert.equal(calls, 3);
});
