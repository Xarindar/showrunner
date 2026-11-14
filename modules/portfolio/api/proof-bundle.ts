import { after } from "next/server";
import { deliverProofArchive, proofExportSignature } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { processProofBundles, queueProofBundle } from "@/lib/portfolio/proof-bundles";
import { getReleasedProofBundle, proofArchivePrefix } from "@/lib/portfolio/purchases";
import { publicRateLimitMessage } from "@/lib/public-rate-limit";
import { getSiteSettings } from "@/lib/site";
import { isSameOriginProofRequest, proofTokenSchema } from "./proof-request";

type Props = { params: Promise<{ token: string }> };
type Selection = NonNullable<Awaited<ReturnType<typeof getReleasedProofBundle>>>;
export const proofBundleHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

export function bundleUnavailable() {
  return new Response("This download is unavailable. Reopen your private photo link.", { status: 404, headers: proofBundleHeaders });
}

async function selectionFor(token: string) {
  if (!proofTokenSchema.safeParse(token).success) return null;
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("portfolio")) return null;
  return getReleasedProofBundle(token, settings.siteId);
}

export async function deliverBundle(selection: Selection, drive: boolean, signal: AbortSignal) {
  const archive = await prisma.portfolioProofBundle.findUnique({ where: { purchaseId: selection.purchaseId, state: "READY", key: { startsWith: proofArchivePrefix } } });
  if (!archive?.driver || !archive.key || archive.sizeBytes === null) return bundleUnavailable();
  try {
    return await deliverProofArchive(archive.driver, archive.key, "Selected-photos.zip", archive.sizeBytes, drive, signal) || bundleUnavailable();
  } catch {
    return new Response("The ZIP couldn’t be retrieved. Reopen your private photo link and try again.", { status: 503, headers: proofBundleHeaders });
  }
}

export async function GET(request: Request, { params }: Props) {
  const { token } = await params;
  const selection = await selectionFor(token);
  if (!selection) return bundleUnavailable();
  const limit = await publicRateLimitMessage("proof_bundle_download", { limit: 30, windowMinutes: 5 });
  if (limit) return new Response(limit, { status: 429, headers: proofBundleHeaders });
  const search = new URL(request.url).searchParams;
  if (search.get("save") === "drive") {
    if (!await prisma.portfolioProofBundle.findUnique({ where: { purchaseId: selection.purchaseId, state: "READY", key: { startsWith: proofArchivePrefix } }, select: { purchaseId: true } })) return bundleUnavailable();
    const expires = Math.floor(Date.now() / 1000) + 300;
    const signature = proofExportSignature(selection.accessId, selection.purchaseId, expires);
    const query = new URLSearchParams({ access: selection.accessId, purchase: selection.purchaseId, expires: String(expires), signature });
    if (search.get("inline") === "1") {
      query.set("inline", "1");
      return Response.json({ path: `/proof-export?${query}` }, { headers: proofBundleHeaders });
    }
    return new Response(null, { status: 303, headers: { ...proofBundleHeaders, location: `/proof-export?${query}` } });
  }
  return deliverBundle(selection, false, request.signal);
}

export async function POST(request: Request, { params }: Props) {
  if (!isSameOriginProofRequest(request)) return bundleUnavailable();
  const selection = await selectionFor((await params).token);
  if (!selection) return bundleUnavailable();
  const limit = await publicRateLimitMessage("proof_bundle_prepare", { limit: 10, windowMinutes: 5 });
  if (limit) return new Response(limit, { status: 429, headers: proofBundleHeaders });
  await queueProofBundle(selection.purchaseId, selection.accessId, new URL(request.url).searchParams.get("retry") === "1");
  after(() => processProofBundles().catch(() => console.error("[proof-delivery] bundle processing unavailable")));
  return new Response(null, { status: 202, headers: proofBundleHeaders });
}
