import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import nodemailer from "nodemailer";

test("Next lint root discovery retains directory-only glob behavior", () => {
  const require = createRequire(import.meta.url);
  const pluginRequire = createRequire(require.resolve("@next/eslint-plugin-next"));
  const { getRootDirs } = pluginRequire("./utils/get-root-dirs.js");
  const directory = mkdtempSync(path.join(process.cwd(), ".lint-"));
  try {
    mkdirSync(path.join(directory, "sites", "one"), { recursive: true });
    mkdirSync(path.join(directory, "sites", "two"));
    const pattern = path.join(directory, "sites", "*").replaceAll("\\", "/");
    const expected = ["one", "two"];
    for (const rootDir of [pattern, [pattern]]) {
      const roots = getRootDirs({ cwd: directory, settings: { next: { rootDir } } });
      assert.deepEqual(roots.map((root: string) => path.basename(root)).sort(), expected);
    }
    assert.deepEqual(getRootDirs({ cwd: directory, settings: {} }), [directory]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("patched mailer composes structured addresses and headers without network delivery", async () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  const result = await transport.sendMail({
    messageId: "<security-check@example.invalid>",
    from: { name: "Showrunner", address: "sender@example.invalid" },
    to: { name: "Customer", address: "customer@example.invalid" },
    replyTo: "reply@example.invalid",
    subject: "Offline compatibility check",
    text: "Plain text", html: "<p>HTML</p>",
    headers: { "X-Showrunner-Test": "offline" },
  });
  assert.deepEqual(result.envelope.to, ["customer@example.invalid"]);
  assert.equal(result.envelope.from, "sender@example.invalid");
  assert.match(result.message.toString(), /X-Showrunner-Test: offline/);
  assert.match(result.message.toString(), /Reply-To: reply@example.invalid/);
});