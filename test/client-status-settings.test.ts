import assert from "node:assert/strict";
import test from "node:test";
import { clientStatusSettingsFromForm, normalizeClientStatusSettings } from "../lib/clients/status-settings";
import { clientStatusLabel, normalizeClientStatus } from "../lib/clients/status";
import { clientServiceId } from "../lib/clients/service-selection";

test("existing sites retain their original statuses and default", () => {
  const settings = normalizeClientStatusSettings(null);
  assert.equal(settings.defaultStatus, "active_order");
  assert.equal(settings.options.length, 7);
  assert.equal(normalizeClientStatus("active"), "active_order");
  assert.equal(clientStatusLabel("order_paid", [{ value: "session_paid", label: "Paid session" }]), "Order Paid");
});

test("photography statuses round-trip with a renamed label and default", () => {
  const form = new FormData();
  for (const value of ["session_booked", "session_paid"]) {
    form.append("clientStatusEnabled", value);
    form.set(`clientStatusLabel_${value}`, value === "session_booked" ? "Session booked" : "Session paid");
  }
  form.set("clientDefaultStatus", "session_booked");
  const settings = clientStatusSettingsFromForm(form);
  assert.deepEqual(normalizeClientStatusSettings(JSON.parse(JSON.stringify(settings))), settings);
  assert.equal(clientStatusLabel("session_paid", settings.options), "Session paid");
  form.set("clientDefaultStatus", "active_order");
  assert.throws(() => clientStatusSettingsFromForm(form), /enabled client status/);
  form.set("clientDefaultStatus", "session_booked");
  form.set("clientStatusLabel_session_paid", " ");
  assert.throws(() => clientStatusSettingsFromForm(form), /label/);
  assert.throws(() => clientStatusSettingsFromForm(new FormData()), /at least one/);
});

test("malformed stored configuration and preferences are handled safely", () => {
  const settings = normalizeClientStatusSettings({ options: [null, { value: {}, label: "Bad" }, { value: "session_booked", label: "Booked" }, { value: "session_booked", label: "Duplicate" }], defaultStatus: "unknown" });
  assert.deepEqual(settings, { options: [{ value: "session_booked", label: "Booked" }], defaultStatus: "session_booked" });
  assert.equal(clientServiceId(null), "");
  assert.equal(clientServiceId({ notes: "Keep me", serviceId: "portrait" }), "portrait");
  assert.equal(clientServiceId({ serviceId: 42 }), "");
});
