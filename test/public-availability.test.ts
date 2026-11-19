import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as bookingRules from "../lib/scheduling/booking-rules";
import * as sessionInput from "../lib/scheduling/session-input";

function load<T>(path: string, mocks: Record<string, unknown>): T {
  const exports = {};
  const require = createRequire(import.meta.url);
  runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, Response, URL, require: (id: string) => id in mocks ? mocks[id] : id === "server-only" || id.startsWith("@/") || id === "next/cache" ? {} : require(id) });
  return exports as T;
}

test("both rate limits preserve CORS only for an authorized key and origin", async () => {
  for (const global of [true, false]) {
    const gateway = load<typeof import("../lib/embed/gateway")>("lib/embed/gateway.ts", {
      "@/lib/embed/keys": {
        normalizeOrigin: (value: string) => value,
        normalizeOrigins: (value: string[]) => value,
        isPublicKeyFormatValid: (value: string) => value.startsWith("pk_"),
        resolveActiveSiteApiKey: async (value: string) => value === "pk_valid" ? { id: "key", siteId: "site", allowedOrigins: ["https://jazzrphotography.com"], scopes: [] } : null
      },
      "@/lib/embed/scopes": { normalizeScopes: () => [] },
      "@/lib/public-rate-limit": { publicGlobalRateLimitMessage: async () => global ? "Try again shortly." : "", publicRateLimitForSite: async () => "Try again shortly." }
    });
    for (const [key, origin, allowed] of [["pk_valid", "https://jazzrphotography.com", true], ["pk_valid", "https://other.example", false], ["pk_invalid", "https://jazzrphotography.com", false]] as const) {
      const request = { headers: new Headers({ origin, "x-showrunner-key": key }), nextUrl: new URL("https://admin.example/api/public/v1/availability") };
      let error;
      try { await gateway.authorizeEmbedRequest(request as Parameters<typeof gateway.authorizeEmbedRequest>[0]); } catch (caught) { error = caught; }
      assert(error);
      const response = gateway.embedError(error, { origin: null });
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), allowed ? origin : null);
      if (allowed) assert.equal(response.status, 429);
    }
  }
});

test("availability batches stop at the first opening, cross months, and bound work", async () => {
  const seen: string[] = [];
  let available = "2027-02-02";
  class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
  const api = load<typeof import("../lib/embed/public-scheduling")>("lib/embed/public-scheduling.ts", {
    "@/lib/scheduling/booking-rules": bookingRules,
    "@/lib/scheduling/session-input": sessionInput,
    "@/lib/embed/gateway": { EmbedRequestError: RequestError },
    "@/lib/bookings/payment": { bookingPaymentProvider: async () => "PAYPAL", releaseUnpaidBookingHolds: async () => {} },
    "@/lib/site": { getSiteSettingsForSite: async () => ({ timezone: "America/Chicago" }) },
    "@/lib/timezone": { parseZonedDateKey: (value: string) => new Date(`${value}T12:00:00Z`) },
    "@/lib/scheduling/native": { nativeSchedulingAdapter: { getSlotDiagnostics: async (_id: string, day: Date, options: { tierId?: string; siteId?: string; requireDuration?: boolean }) => {
      assert.equal(options.requireDuration, true);
      assert.equal(options.tierId, "classic"); assert.equal(options.siteId, "site");
      const key = day.toISOString().slice(0, 10); seen.push(key);
      return { slots: key === available ? [{ available: true, startsAt: day, endsAt: day }] : [] };
    } } }
  });
  const input = { serviceId: "wedding", siteId: "site", tierId: "classic", date: "2027-01-30" };
  assert.equal((await api.getPublicNextAvailability(input, 14))?.date, available);
  assert.deepEqual(seen, ["2027-01-30", "2027-01-31", "2027-02-01", "2027-02-02"]);
  available = ""; seen.length = 0;
  assert.equal(await api.getPublicNextAvailability(input, 14), null);
  assert.equal(seen.length, 14);
  for (const days of [0, 15, 1.5, NaN]) await assert.rejects(api.getPublicNextAvailability(input, days), /between 1 and 14/);
  await assert.rejects(api.getPublicNextAvailability({ ...input, date: "2027-02-30" }, 14), /valid date/);
});
