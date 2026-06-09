import crypto from "node:crypto";

export function bearerToken(request: Request) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
}

export function headerOrBearerSecret(request: Request, headerName: string) {
  return request.headers.get(headerName)?.trim() || bearerToken(request);
}

export function timingSafeSecretMatches(expected: string, provided: string) {
  if (!expected || !provided) return false;

  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  const providedHash = crypto.createHash("sha256").update(provided).digest();
  return crypto.timingSafeEqual(expectedHash, providedHash);
}
