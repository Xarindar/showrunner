import { NextResponse } from "next/server";
import { finalizeProofSelection, getProofSelection, ProofSelectionError } from "@/lib/portfolio/purchases";
import { publicRateLimitMessage } from "@/lib/public-rate-limit";
import { getSiteSettings } from "@/lib/site";
import { isSameOriginProofRequest, proofSelectionSchema, proofTokenSchema, readProofRequestBody } from "./proof-request";

type ProofRouteProps = { params: Promise<{ token: string }> };

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff"
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

function failure(error: unknown) {
  if (error instanceof ProofSelectionError) return json({ error: error.message }, error.status);
  return json({ error: "We couldn’t load your selection. Please try again." }, 503);
}

export async function GET(_request: Request, { params }: ProofRouteProps) {
  try {
    const { token } = await params;
    const settings = await getSiteSettings();
    if (!settings.enabledModuleIds.includes("portfolio") || !proofTokenSchema.safeParse(token).success) {
      return json({ error: "This proof link is unavailable." }, 404);
    }
    const limit = await publicRateLimitMessage("proof_selection_read", { limit: 120, windowMinutes: 1 });
    if (limit) return json({ error: limit }, 429);
    const selection = await getProofSelection(token);
    if (!selection) return json({ error: "This proof link is unavailable. Ask your photographer for a new link." }, 404);
    return json(selection);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, { params }: ProofRouteProps) {
  if (!isSameOriginProofRequest(request)) return json({ error: "Open your proof link and try again." }, 403);
  try {
    const { token } = await params;
    const settings = await getSiteSettings();
    if (!settings.enabledModuleIds.includes("portfolio") || !proofTokenSchema.safeParse(token).success) {
      return json({ error: "This proof link is unavailable." }, 404);
    }
    const limit = await publicRateLimitMessage("proof_selection_finalize", { limit: 12, windowMinutes: 10 });
    if (limit) return json({ error: limit }, 429);

    let body: unknown;
    try {
      body = await readProofRequestBody(request);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      return json({ error: reason === "BODY_TOO_LARGE" ? "Choose fewer photos and try again." : "Send a valid photo selection." }, reason === "BODY_TOO_LARGE" ? 413 : 400);
    }
    const parsed = proofSelectionSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Choose at least one photo, without duplicate selections." }, 400);
    return json(await finalizeProofSelection({ token, itemIds: parsed.data.itemIds, expectedTermsVersion: parsed.data.expectedTermsVersion }));
  } catch (error) {
    return failure(error);
  }
}
