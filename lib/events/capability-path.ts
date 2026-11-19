export function isSensitiveCapabilityPath(pathname: string) {
  return pathname.startsWith("/uploads")
    || pathname.startsWith("/api/uploads/")
    || pathname.startsWith("/api/payments/connect/")
    || pathname === "/proof-export"
    || pathname === "/proofs"
    || pathname.startsWith("/proofs/")
    || pathname.startsWith("/api/portfolio/")
    || pathname === "/billing"
    || pathname.startsWith("/billing/")
    || pathname === "/api/calendar/booking.ics";
}

export function safeAttributionUrl(value = "") {
  if (!value) return "";
  try {
    const url = new URL(value, "https://attribution.invalid");
    if (isSensitiveCapabilityPath(decodeURIComponent(url.pathname))) return "";
    for (const param of url.searchParams.values()) {
      if (/\/billing(?:\/|$)|\/api\/calendar\/booking\.ics/i.test(param)) return "";
    }
    return value;
  } catch {
    return "";
  }
}
