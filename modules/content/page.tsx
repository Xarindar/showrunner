import { MediaVariantType } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { isMediaUploadDriverConfigured, mediaAssetDisplayUrl } from "@/lib/media";
import { getSiteSettings } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { PuckContentEditor } from "./studio/puck-editor";
import { readStudio, resolveStudioPayload } from "./studio/state";
import { resolveBusinessInfo } from "./studio/business-info";
import { blockDependenciesAvailable } from "./studio/manifest";
import { getEditorManifest } from "@/clients/content-editor-manifests";

export const dynamic = "force-dynamic";
export default async function ContentPage() {
  await requireAdmin("content:manage");
  const settings = await getSiteSettings();
  const manifest = await getEditorManifest(settings);
  const studio = readStudio(settings.publicContentConfig);
  const services = settings.enabledModuleIds.includes("scheduling") ? await prisma.service.findMany({
    where: { siteId: settings.siteId, isActive: true }, include: { mediaAsset: true }, orderBy: { name: "asc" }
  }) : [];
  return <PuckContentEditor manifest={manifest} canUpload={isMediaUploadDriverConfigured(settings.mediaDriver)} linkChoices={services.map(service => ({ id: service.id, slug: service.slug, label: service.name, category: service.category || "" }))} entries={manifest.blocks.filter(block => blockDependenciesAvailable(block, settings.enabledModuleIds)).map(block => ({
    block,
    payload: block.type === "business" ? resolveBusinessInfo(settings, block.defaults) : resolveStudioPayload(block, studio.blocks[block.id]),
    revision: studio.blocks[block.id]?.revision || 0,
    pageIds: studio.blocks[block.id]?.pageIds || block.pageIds,
    choices: services.filter(service => !block.sourceCategory || service.category?.toLowerCase() === block.sourceCategory.toLowerCase()).map(service => ({
      description: service.description || "", id: service.id,
      imageUrl: service.mediaAsset ? mediaAssetDisplayUrl(service.mediaAsset, MediaVariantType.CARD) : service.imageUrl,
      label: service.name
    }))
  }))} />;
}
