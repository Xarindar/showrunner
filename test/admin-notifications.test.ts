import assert from "node:assert/strict";
import test from "node:test";
import { consumeNotification, notificationDuration } from "../lib/admin-notifications";

test("all toast tones expire with enough time to read errors and long messages", () => {
  assert.equal(notificationDuration("danger", "Save failed"), 8000);
  assert.equal(notificationDuration("danger", "x".repeat(120)), 10000);
  assert.equal(notificationDuration("success", "Saved"), 5000);
  assert.equal(notificationDuration("neutral", "x".repeat(120)), 10000);
});

test("flash consumption preserves filters, other messages and fragments", () => {
  const href = "https://example.com/admin/modules/portfolio?gallery=123&saved=updated&error=failed&q=a%26b#photos";
  const next = consumeNotification(href, "saved");
  assert.equal(next, "/admin/modules/portfolio?gallery=123&error=failed&q=a%26b#photos");
  assert.equal(consumeNotification(`https://example.com${next}`, "saved"), null);
  assert.equal(consumeNotification(`https://example.com${next}`, "error"), "/admin/modules/portfolio?gallery=123&q=a%26b#photos");
  assert.equal(consumeNotification("https://example.com/admin?saved=", "saved"), "/admin");
});
