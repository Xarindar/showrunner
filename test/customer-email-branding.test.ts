import assert from "node:assert/strict";
import test from "node:test";
import { emailBrandProfile, emailBrandProfiles } from "../lib/email/brand-profiles";
import { bookingCalendarLinks, customerEmailDefaults } from "../lib/email/customer-layouts";
import { renderEmailTemplate } from "../lib/email/render";

const cottage = { siteId: "cottage", businessName: "Cottage 616", publicContentConfig: { profiles: { cottage616: {}, "the-hive": {} } } };

test("brand choices and routing follow the site's booking profiles", () => {
  assert.deepEqual(emailBrandProfiles(cottage).map(profile => profile.key), ["cottage616", "the-hive"]);
  assert.equal(emailBrandProfile(cottage, "events").key, "cottage616");
  assert.equal(emailBrandProfile(cottage, "the-hive").key, "the-hive");
  assert.equal(emailBrandProfile(cottage).key, "cottage616");
  assert.deepEqual(emailBrandProfile({ siteId: "studio", businessName: "Jazzr", publicContentConfig: {} }, "the-hive"), { key: "default", name: "Jazzr" });
});

test("confirmation renders its logo, clickable address and calendar with escaped booking data", async () => {
  const key = "booking.confirmed.customer";
  const template = {
    ...customerEmailDefaults[key], key, version: 1, body: "",
    textBody: customerEmailDefaults[key].textBody.replaceAll("\n", "\r\n"),
    requiredTokens: [...customerEmailDefaults[key].requiredTokens]
  };
  const location = "25 Main St #4, Bay & Pine";
  const links = bookingCalendarLinks({ startsAt: new Date("2026-11-20T15:00:00Z"), endsAt: new Date("2026-11-20T16:00:00Z"), title: "Head Spa & Care", location, confirmed: true });
  const tokens = { businessName: "The Hive", customerName: "<Sam>", serviceName: "Head Spa", appointmentTime: "10:00 AM", appointmentLocation: location, emailLogoUrl: "https://example.test/hive.png", ...links };
  const email = await renderEmailTemplate(template, tokens);
  assert.match(email.htmlBody, /src="https:\/\/example\.test\/hive\.png"/);
  assert.match(email.htmlBody, /Hi &lt;Sam&gt;/);
  assert.match(email.htmlBody, /<a href="https:\/\/www\.google\.com\/maps\/search\//);
  assert.match(email.htmlBody, /<a href="https:\/\/calendar\.google\.com\/calendar\/render/);
  assert.equal(new URL(links.mapsUrl).searchParams.get("query"), location);
  assert.equal(new URL(links.calendarUrl).searchParams.get("dates"), "20261120T150000Z/20261120T160000Z");
  assert.ok(email.textBody.includes(location));
  assert.equal((await renderEmailTemplate({ ...template, version: 2, htmlBody: "<p>My own email</p>" }, tokens)).htmlBody, "<p>My own email</p>");
});

test("gallery email works without a cover or logo and keeps the private gallery link", async () => {
  const key = "portfolio.session.ready";
  const template = { ...customerEmailDefaults[key], key, version: 1, body: "", requiredTokens: [...customerEmailDefaults[key].requiredTokens] };
  const email = await renderEmailTemplate(template, { businessName: "Jazzr", customerName: "Sam", sessionName: "Portraits", galleryUrl: "https://example.test/proofs/fixture" });
  assert.match(email.htmlBody, /Your gallery is ready/);
  assert.match(email.htmlBody, /<a href="https:\/\/example\.test\/proofs\/fixture"/);
  assert.match(email.htmlBody, /Jazzr/);
  assert.doesNotMatch(email.htmlBody, /<img/);
});
