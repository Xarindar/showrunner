export function isPrivateUrlHostname(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "metadata.google.internal" || host.endsWith(".local")) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^0\./.test(host) || /^169\.254\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;

  const private172 = /^172\.(\d{1,2})\./.exec(host);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

export function isSafeExternalHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !isPrivateUrlHostname(url.hostname);
  } catch {
    return false;
  }
}
