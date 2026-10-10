import { z } from "zod";

export const proofSelectionSchema = z.object({
  expectedTermsVersion: z.string().regex(/^[a-f0-9]{64}$/),
  itemIds: z.array(z.string().trim().min(1).max(128)).min(1).max(2000)
    .refine((ids) => new Set(ids).size === ids.length, "Each photo may only be selected once.")
}).strict();

export const proofTokenSchema = z.string().min(1).max(256).refine((value) => value === value.trim());

// A token is a bearer capability. Require same-origin JSON and a custom header
// so that a third-party form cannot finalize a selection in the viewer's browser.
export function isSameOriginProofRequest(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || (fetchSite && fetchSite !== "same-origin") || request.headers.get("x-proof-request") !== "1") return false;
  try {
    const source = new URL(origin);
    if (!["https:", "http:"].includes(source.protocol) || source.origin !== origin) return false;
    // Next may reconstruct request.url with an internal hostname/protocol. The
    // HTTP Host is the browser's actual destination; never trust a caller's
    // X-Forwarded-Host for this CSRF comparison. Site lookup independently
    // requires the destination to belong to a registered site.
    const host = request.headers.get("host") || new URL(request.url).host;
    if (/[\s,/@\\?#]/.test(host)) return false;
    return source.host === new URL(`${source.protocol}//${host}`).host;
  } catch {
    return false;
  }
}

export async function readProofRequestBody(request: Request) {
  const limit = 256 * 1024;
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) {
    throw new Error("JSON_REQUIRED");
  }
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit) throw new Error("BODY_TOO_LARGE");
  if (!request.body) throw new Error("INVALID_BODY");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body)) as unknown;
}
