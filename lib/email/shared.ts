import type { EmailHeaders } from "./types";

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function cleanHeaders(value: EmailHeaders | undefined) {
  if (!value) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, headerValue]) => [key.trim(), String(headerValue).trim()])
      .filter(([key, headerValue]) => key && headerValue)
  );
}

export function jsonHeaders(value: unknown): EmailHeaders {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, headerValue]) => [key, typeof headerValue === "string" ? headerValue : String(headerValue)])
      .filter(([key, headerValue]) => key && headerValue)
  );
}

export function cleanError(error: unknown) {
  const message = error instanceof Error ? error.message : "Email operation failed.";
  return message.slice(0, 1000);
}
