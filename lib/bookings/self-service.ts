import "server-only";

import crypto from "node:crypto";

const fallbackSecret = "dev-booking-self-service-secret-change-before-deploying";

type BookingTokenInput = {
  bookingId: string;
  customerEmail: string;
  siteId: string;
};

function isWeakProductionSecret(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length < 32 || normalized.includes("replace-with") || normalized.includes("local-dev") || normalized.includes("change-me");
}

function selfServiceSecret() {
  const secret = process.env.BOOKING_SELF_SERVICE_SECRET || process.env.AUTH_SECRET || "";
  if (process.env.NODE_ENV === "production" && (!secret || isWeakProductionSecret(secret))) {
    throw new Error("BOOKING_SELF_SERVICE_SECRET or AUTH_SECRET must be strong before booking self-service links can be used.");
  }

  return secret || fallbackSecret;
}

function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

function tokenPayload(input: BookingTokenInput) {
  return ["booking-self-service", "v1", input.siteId, input.bookingId, normalizedEmail(input.customerEmail)].join(":");
}

export function bookingSelfServiceToken(input: BookingTokenInput) {
  return crypto.createHmac("sha256", selfServiceSecret()).update(tokenPayload(input)).digest("base64url");
}

export function verifyBookingSelfServiceToken(input: BookingTokenInput & { token: string }) {
  if (!input.token) return false;

  const expected = bookingSelfServiceToken(input);
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  const tokenHash = crypto.createHash("sha256").update(input.token).digest();
  return crypto.timingSafeEqual(expectedHash, tokenHash);
}

export function bookingSelfServicePath(input: BookingTokenInput) {
  const params = new URLSearchParams({
    token: bookingSelfServiceToken(input)
  });

  return `/bookings/${encodeURIComponent(input.bookingId)}?${params.toString()}`;
}
