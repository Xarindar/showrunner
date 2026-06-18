export function positiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeOrigin(value: string) {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    return url.origin;
  } catch {
    return "";
  }
}

function isLocalOrigin(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local");
  } catch {
    return true;
  }
}

export function publicAppBaseUrl() {
  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL || "");
  if (configured && (process.env.NODE_ENV !== "production" || !isLocalOrigin(configured))) {
    return configured;
  }

  const railwayOrigin =
    normalizeOrigin(process.env.RAILWAY_PUBLIC_DOMAIN || "") ||
    normalizeOrigin(process.env.RAILWAY_STATIC_URL || "");

  return railwayOrigin || configured || "http://localhost:3000";
}
