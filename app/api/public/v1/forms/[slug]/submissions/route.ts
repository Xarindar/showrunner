import type { NextRequest } from "next/server";
import { EmbedRequestError, authorizeEmbedRequest, embedError, embedJson, handleEmbedPreflight, type EmbedContext } from "@/lib/embed/gateway";
import { createPublicFormSubmission } from "@/lib/embed/public-forms";
import { publicRateLimitForSite } from "@/lib/public-rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PublicFormSubmissionRouteProps = {
  params: Promise<{ slug: string }>;
};

export async function OPTIONS(request: NextRequest) {
  return handleEmbedPreflight(request);
}

export async function POST(request: NextRequest, { params }: PublicFormSubmissionRouteProps) {
  let context: EmbedContext = { key: null as never, origin: null, scopes: [], siteId: "" };
  try {
    const { slug } = await params;
    context = await authorizeEmbedRequest(request, {
      requireModuleId: "forms",
      scope: "forms:write"
    });
    const formData = await request.formData().catch(() => null);
    if (!formData) throw new EmbedRequestError("Invalid form submission.", 400);
    if (String(formData.get("companyWebsite") || "").trim()) {
      return embedJson({ submission: null, successMessage: "Thanks. Your form was submitted." }, context, { status: 201 });
    }
    const limited = await publicRateLimitForSite(context.siteId, "form_submission");
    if (limited) throw new EmbedRequestError(limited, 429);
    const url = new URL(request.url);
    return embedJson(
      await createPublicFormSubmission({
        formData,
        pathname: `/api/public/v1/forms/${slug}/submissions`,
        searchParams: Object.fromEntries(url.searchParams),
        siteId: context.siteId,
        slug
      }),
      context,
      { status: 201 }
    );
  } catch (error) {
    return embedError(error, context);
  }
}
