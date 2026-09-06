import { MediaVariantType } from "@prisma/client";
import "server-only";
import { publicAppBaseUrl } from "@/lib/env";
import { mediaAssetDisplayUrl } from "@/lib/media";
import { getSiteSettingsForSite } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { getEditorManifest } from "@/clients/content-editor-manifests";
import { readStudio, resolveStudioPayload } from "./state";
import { resolveBusinessInfo, resolveBusinessLocation } from "./business-info";
import { blockDependenciesAvailable } from "./manifest";
import { EmbedRequestError } from "@/lib/embed/gateway";
import { renderContentRichText } from "./rich-text";

export async function getPublicStudio(siteId: string, pageId: string) {
  const settings = await getSiteSettingsForSite(siteId);
  const manifest = await getEditorManifest(settings);
  if (!manifest.pages.some(page => page.id === pageId)) throw new EmbedRequestError("Unknown content page", 404);
  const state = readStudio(settings.publicContentConfig);
  const business = resolveBusinessInfo(settings, manifest.blocks.find(block => block.type === "business")?.defaults);
  const blocks = await Promise.all(manifest.blocks.filter(block => block.type !== "business" && blockDependenciesAvailable(block, settings.enabledModuleIds)).map(async block => {
    const stored = state.blocks[block.id];
    const payloadPages = stored?.pageIds || block.pageIds;
    if ((!stored && !block.defaults) || !block.pageIds.includes(pageId) || !payloadPages.includes(pageId)) return null;
    if (block.formId && !await prisma.form.findFirst({ where: { id: block.formId, siteId, status: "ACTIVE" }, select: { id: true } })) return null;
    let payload = resolveStudioPayload(block, stored);
    if (block.type === "about") payload = { ...payload, copyHtml: renderContentRichText(String(payload.copy || "")) };
    if (block.type === "faq") payload = { ...payload, items: (payload.items as Record<string, unknown>[]).map(item => ({ ...item, answerHtml: renderContentRichText(String(item.answer || "")) })) };
    if (block.type === "contact") {
      try { payload = { ...payload, business: resolveBusinessLocation(business, String(payload.locationId || "")) }; }
      catch { payload = { ...payload, business }; }
    }
    if (block.source === "services") {
      const ids = (payload.items as { referenceId: string }[]).map(item => item.referenceId);
      const items = await prisma.service.findMany({
        where: {
          siteId,
          isActive: true,
          id: { in: ids },
          ...(block.sourceCategory ? { category: { equals: block.sourceCategory, mode: "insensitive" as const } } : {})
        },
        include: { mediaAsset: true }
      });
      payload = {
        ...payload,
        items: (payload.items as { referenceId: string; title?: string; description?: string }[]).flatMap(row => items.filter(item => item.id === row.referenceId).map(item => ({
          description: row.description?.trim() || item.description || "",
          id: item.id,
          imageUrl: publicMediaUrl(item.mediaAsset ? mediaAssetDisplayUrl(item.mediaAsset, MediaVariantType.CARD) : item.imageUrl),
          name: row.title?.trim() || item.name
        })))
      };
    }
    payload = absolutizeBlockMedia(block.type, payload);
    return { id: block.id, type: block.type, schemaVersion: 1, payload, presentation: block.presentation || {}, ...(block.formId ? { formId: block.formId } : {}) };
  }));
  return { schemaVersion: 1, pageId, businessConfigured: Boolean(state.blocks["business-info"]), business, blocks: blocks.filter(block => block !== null) };
}

function publicMediaUrl(value: unknown) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return new URL(url, publicAppBaseUrl()).toString();
  return url;
}

function absolutizeRows(payload: Record<string, unknown>, field: string, urlKey: string) {
  const rows = Array.isArray(payload[field]) ? payload[field] as Record<string, unknown>[] : [];
  return { ...payload, [field]: rows.map(row => ({ ...row, [urlKey]: publicMediaUrl(row[urlKey]) })) };
}

function absolutizeBlockMedia(type: string, payload: Record<string, unknown>) {
  if (type === "slideshow") return absolutizeRows(payload, "slides", "imageUrl");
  if (type === "strip") return absolutizeRows(payload, "images", "url");
  if (type === "hero" || type === "gallery") return absolutizeRows(payload, "images", "url");
  if (type === "team" || type === "directory") return absolutizeRows(payload, "items", "imageUrl");
  if (["about", "coupon", "featured", "mailingList"].includes(type)) return { ...payload, imageUrl: publicMediaUrl(payload.imageUrl) };
  return payload;
}
