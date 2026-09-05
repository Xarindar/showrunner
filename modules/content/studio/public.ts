import "server-only";
import { getSiteSettingsForSite } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { resolveContentManifest } from "@/clients/content-manifests";
import { readStudio } from "./state";
import { resolveBusinessInfo, resolveBusinessLocation } from "./business-info";
import { blockDependenciesAvailable } from "./manifest";
import { EmbedRequestError } from "@/lib/embed/gateway";
import { renderContentRichText } from "./rich-text";

export async function getPublicStudio(siteId: string, pageId: string) {
  const settings = await getSiteSettingsForSite(siteId);
  const manifest = resolveContentManifest(siteId, settings.publicContentConfig);
  if (!manifest.pages.some(page => page.id === pageId)) throw new EmbedRequestError("Unknown content page", 404);
  const state = readStudio(settings.publicContentConfig);
  const business = resolveBusinessInfo(settings);
  const blocks = await Promise.all(manifest.blocks.filter(block => block.type !== "business" && blockDependenciesAvailable(block, settings.enabledModuleIds)).map(async block => {
    const stored = state.blocks[block.id];
    if (!stored || !block.pageIds.includes(pageId) || !stored.pageIds.includes(pageId)) return null;
    if (block.formId && !await prisma.form.findFirst({ where: { id: block.formId, siteId, status: "ACTIVE" }, select: { id: true } })) return null;
    let payload = stored.payload;
    if (block.type === "about") payload = { ...payload, copyHtml: renderContentRichText(String(payload.copy || "")) };
    if (block.type === "faq") payload = { ...payload, items: (payload.items as Record<string, unknown>[]).map(item => ({ ...item, answerHtml: renderContentRichText(String(item.answer || "")) })) };
    if (block.type === "contact") {
      try { payload = { ...payload, business: resolveBusinessLocation(business, String(payload.locationId || "")) }; }
      catch { payload = { ...payload, business }; }
    }
    if (block.source === "services") {
      const ids = (payload.items as { referenceId: string }[]).map(item => item.referenceId);
      const items = await prisma.service.findMany({ where: { siteId, isActive: true, id: { in: ids } }, select: { id: true, name: true, description: true, imageUrl: true } });
      payload = { ...payload, items: ids.flatMap(id => items.filter(item => item.id === id)) };
    }
    return { id: block.id, type: block.type, schemaVersion: 1, payload, presentation: block.presentation || {}, ...(block.formId ? { formId: block.formId } : {}) };
  }));
  return { schemaVersion: 1, pageId, businessConfigured: Boolean(state.blocks["business-info"]), business, blocks: blocks.filter(block => block !== null) };
}
