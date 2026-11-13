import test from "node:test";
import assert from "node:assert/strict";
import { locationMapHref, locationSuggestions } from "../lib/locations";

test("location suggestions build addresses, deduplicate and reject invalid provider data", () => {
  const feature = { properties: { name: "Studio", housenumber: "12", street: "Main St", city: "Chicago", state: "Illinois", country: "United States" } };
  assert.deepEqual(locationSuggestions({ features: [feature, feature] }), ["Studio, 12 Main St, Chicago, Illinois, United States"]);
  assert.deepEqual(locationSuggestions({ features: [{ properties: { name: 12 } }] }), []);
  assert.deepEqual(locationSuggestions({ features: [{ properties: {} }] }), []);
  assert.deepEqual(locationSuggestions(null), []);
});

test("map links safely encode the saved location", () => {
  const url = new URL(locationMapHref("Studio & garden #2, Chicago"));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("query"), "Studio & garden #2, Chicago");
});
