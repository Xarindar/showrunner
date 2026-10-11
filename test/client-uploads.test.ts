import assert from "node:assert/strict";
import test from "node:test";
import { uploadInput, maxFileBytes, requestIsOpen, attachmentDisposition } from "../lib/uploads/validation";
import { hasAdminPermission } from "../lib/admin-permissions";

const valid = { filename: "original.CR3", sizeBytes: maxFileBytes, senderName: "Client", senderEmail: "client@example.com" };

test("original uploads accept opaque formats and enforce metadata and size limits", () => {
  assert.equal(uploadInput.safeParse(valid).success, true);
  for (const changes of [{ sizeBytes: maxFileBytes + 1 }, { sizeBytes: 0 }, { sizeBytes: 1.5 },
    { filename: "../file.jpg" }, { filename: "folder\\file.jpg" }, { filename: "bad\r\nheader.jpg" },
    { senderName: " " }, { senderEmail: "invalid" }]) {
    assert.equal(uploadInput.safeParse({ ...valid, ...changes }).success, false);
  }
});

test("closed and expired requests cannot authorize uploads", () => {
  const now = new Date("2026-10-10T00:00:00Z");
  assert.equal(requestIsOpen({ closedAt: null, expiresAt: new Date("2026-11-01") }, now), true);
  assert.equal(requestIsOpen({ closedAt: now, expiresAt: new Date("2026-11-01") }, now), false);
  assert.equal(requestIsOpen({ closedAt: null, expiresAt: now }, now), false);
});

test("downloads use safe attachments with original Unicode filenames", () => {
  const value = attachmentDisposition('café "original".HEIC');
  assert.match(value, /^attachment;/);
  assert.match(value, /caf%C3%A9%20%22original%22.HEIC/);
  assert.doesNotMatch(attachmentDisposition("a\r\nb.jpg"), /[\r\n]/);
});

test("client originals are limited to owners and admins by default", () => {
  assert.equal(hasAdminPermission({ role: "OWNER" }, "uploads:manage"), true);
  assert.equal(hasAdminPermission({ role: "ADMIN" }, "uploads:manage"), true);
  for (const role of ["STAFF", "PHOTOGRAPHER", "FULFILLMENT", "ACCOUNTANT", "VIEWER"] as const) {
    assert.equal(hasAdminPermission({ role }, "uploads:manage"), false);
  }
});
