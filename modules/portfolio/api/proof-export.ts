import { timingSafeEqual } from "node:crypto";
import { proofExportSignature } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getReleasedProofBundle } from "@/lib/portfolio/purchases";
import { publicRateLimitMessage } from "@/lib/public-rate-limit";
import { getSiteSettings } from "@/lib/site";
import { bundleUnavailable, deliverBundle, proofBundleHeaders } from "./proof-bundle";

export async function exportSelection(query: URLSearchParams) {
  const accessId = query.get("access") || "";
  const purchaseId = query.get("purchase") || "";
  const expires = Number(query.get("expires"));
  const signature = query.get("signature") || "";
  const now = Math.floor(Date.now() / 1000);
  if (!/^[a-z0-9_-]{1,128}$/i.test(accessId) || !/^[a-z0-9_-]{1,128}$/i.test(purchaseId) ||
    !Number.isSafeInteger(expires) || expires < now || expires > now + 300 || !/^[a-z0-9_-]{43}$/i.test(signature) ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(proofExportSignature(accessId, purchaseId, expires)))) return null;
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("portfolio")) return null;
  const access = await prisma.portfolioGalleryAccess.findUnique({ where: { id: accessId, siteId: settings.siteId }, select: { accessToken: true } });
  const selection = access && await getReleasedProofBundle(access.accessToken, settings.siteId);
  return selection?.accessId === accessId && selection.purchaseId === purchaseId ? selection : null;
}

// Drive fetches the signed ZIP from a different origin. The proof link itself never enables CORS.
const driveCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range",
  "Access-Control-Expose-Headers": "Accept-Ranges, Cache-Control, Content-Encoding, Content-Length, Content-Range"
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...proofBundleHeaders, ...driveCorsHeaders } });
}

async function driveDownload(request: Request) {
  const selection = await exportSelection(new URL(request.url).searchParams);
  if (!selection) return bundleUnavailable();
  const limit = await publicRateLimitMessage("proof_bundle_drive", { limit: 30, windowMinutes: 5 });
  if (limit) return new Response(limit, { status: 429, headers: proofBundleHeaders });
  return deliverBundle(selection, true, request);
}

export async function GET(request: Request) {
  const response = await driveDownload(request);
  for (const [name, value] of Object.entries(driveCorsHeaders)) response.headers.set(name, value);
  return response;
}

export async function HEAD(request: Request) {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}
