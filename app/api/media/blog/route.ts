import { MediaVariantType } from "@prisma/client";
import { NextResponse } from "next/server";
import { getOwnerStaffIds, requireAdmin, resolveDataScopeMode } from "@/lib/auth";
import { mediaAssetDisplayUrl, uploadMedia } from "@/lib/media";
import { getSiteSettings } from "@/lib/site";

export async function POST(request: Request) {
  try {
    const user = await requireAdmin("blog:manage");
    const settings = await getSiteSettings();
    const formData = await request.formData();
    const file = formData.get("file");
    const alt = String(formData.get("alt") || "").trim().slice(0, 240);
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
    }

    const ownerStaffIds = await getOwnerStaffIds(user, settings.siteId);
    if ((await resolveDataScopeMode(user, settings.siteId, "media")) === "OWN" && !ownerStaffIds.length) {
      return NextResponse.json({ error: "Create an active staff profile before uploading scoped blog media." }, { status: 403 });
    }

    const asset = await uploadMedia(
      file,
      {
        alt: alt || file.name,
        folder: "blog/body",
        tags: ["blog", "inline"],
        uploadedByStaffId: ownerStaffIds[0],
        usageContext: "inline blog image"
      },
      settings.mediaDriver,
      settings.siteId
    );

    return NextResponse.json({
      alt: asset.alt || alt || file.name,
      url: mediaAssetDisplayUrl(asset, MediaVariantType.FULL)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
