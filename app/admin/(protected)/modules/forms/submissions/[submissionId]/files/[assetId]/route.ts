import { MediaVariantType } from "@prisma/client";
import type { NextRequest } from "next/server";
import { getAccessibleFormSubmissionWhere, requireAdmin } from "@/lib/auth";
import { mediaDeliveryResponse } from "@/lib/media";
import { isRecord } from "@/lib/objects";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";

export const runtime = "nodejs";

type FormSubmissionFileRouteProps = {
  params: Promise<{ assetId: string; submissionId: string }>;
};

function notFound() {
  return new Response("Not found", { status: 404 });
}

function submissionReferencesAsset(data: unknown, assetId: string) {
  if (!isRecord(data)) return false;

  return Object.values(data).some((entry) => {
    if (!isRecord(entry) || !isRecord(entry.file)) return false;
    return entry.file.assetId === assetId;
  });
}

export async function GET(request: NextRequest, { params }: FormSubmissionFileRouteProps) {
  const user = await requireAdmin("forms:manage");
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("forms")) return notFound();

  const { assetId, submissionId } = await params;
  const submission = await prisma.formSubmission.findFirst({
    where: await getAccessibleFormSubmissionWhere(user, settings.siteId, { id: submissionId }),
    select: { data: true }
  });

  if (!submission || !submissionReferencesAsset(submission.data, assetId)) return notFound();

  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, siteId: settings.siteId },
    select: {
      deletedAt: true,
      driver: true,
      filename: true,
      id: true,
      isPrivate: true,
      key: true,
      mimeType: true,
      storageProviderId: true,
      url: true
    }
  });

  if (!asset || !asset.isPrivate) return notFound();

  const response = await mediaDeliveryResponse({
    asset,
    download: true,
    privateAccess: true,
    request,
    type: MediaVariantType.DOWNLOAD
  });

  return response || notFound();
}
