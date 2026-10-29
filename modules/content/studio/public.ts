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

import { resolveFeatured } from "./featured";
import { contentLinkOptions } from "./field-layout";
import { catalogMediaUrl } from "@/lib/catalog-media-url";
import { showcaseCatalog } from "./showcase-catalog";
import { resolveShowcase, type ShowcaseRow } from "./showcase";

import { desktopPayload, resolveMobilePayload } from "./mobile-overrides";

export async function getPublicStudio(siteId: string, pageId: string) {
  const settings = await getSiteSettingsForSite(siteId);
  const manifest = await getEditorManifest(settings);
  if (!manifest.pages.some(page => page.id === pageId)) throw new EmbedRequestError("Unknown content page", 404);
  const catalog = manifest.blocks.some(block => block.type === "showcase") ? await showcaseCatalog(siteId, settings.enabledModuleIds) : [];
  const state = readStudio(settings.publicContentConfig);
  const business = resolveBusinessInfo(settings, manifest.blocks.find(block => block.type === "business")?.defaults);
  const blocks = await Promise.all(manifest.blocks.filter(block => block.type !== "business" && blockDependenciesAvailable(block, settings.enabledModuleIds)).map(async block => {
    const stored = state.blocks[block.id];
    const payloadPages = stored?.pageIds || block.pageIds;
    if ((!stored && !block.defaults) || !block.pageIds.includes(pageId) || !payloadPages.includes(pageId)) return null;
    if (block.formId && !await prisma.form.findFirst({ where: { id: block.formId, siteId, status: "ACTIVE" }, select: { id: true } })) return null;
    const original = resolveStudioPayload(block, stored);
    async function renderPayload(payload: Record<string, unknown>, mobile = false) {
      payload = desktopPayload(payload);
      const visibleBusiness = mobile ? resolveMobilePayload(business) : business;
      if (block.type === "showcase") payload = { ...payload, items: resolveShowcase(payload.items as ShowcaseRow[], catalog, manifest).map(item => ({ ...item, imageUrl: publicMediaUrl(catalogMediaUrl(item.imageUrl, manifest.previewUrl)) })) };
      if (block.type === "about") payload = { ...payload, copyHtml: renderContentRichText(String(payload.copy || "")) };
      if (block.type === "faq") payload = { ...payload, items: (payload.items as Record<string, unknown>[]).map(item => ({ ...item, answerHtml: renderContentRichText(String(item.answer || "")) })) };
      if (block.type === "contact") {
        try { payload = { ...payload, business: resolveBusinessLocation(visibleBusiness, String(payload.locationId || "")) }; }
        catch { payload = { ...payload, business: visibleBusiness }; }
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
          items: (payload.items as Record<string, unknown>[]).flatMap(row => items.filter(item => item.id === row.referenceId).map(item => resolveFeatured(row, {
            ...item, imageUrl: publicMediaUrl(item.mediaAsset ? (!item.mediaAsset.isPrivate && !item.mediaAsset.deletedAt && item.mediaAsset.siteId === siteId ? mediaAssetDisplayUrl(item.mediaAsset, item.imageFraming ? MediaVariantType.FULL : MediaVariantType.CARD) : "") : item.imageUrl),
            framingUrl: publicMediaUrl(item.mediaAsset ? (!item.mediaAsset.isPrivate && !item.mediaAsset.deletedAt && item.mediaAsset.siteId === siteId ? mediaAssetDisplayUrl(item.mediaAsset, MediaVariantType.FULL) : "") : item.imageUrl),
            href: contentLinkOptions(manifest, [{ id: item.id, slug: item.slug, label: item.name, category: item.category }]).services[0]?.href
          })))
        };
      }
      payload = absolutizeBlockMedia(block.type, payload);
      return payload;
    }
    const payload = await renderPayload(original);
    const hasMobile = (Array.isArray(original.mobileOverrides) && original.mobileOverrides.length > 0) || (block.type === "contact" && Array.isArray(business.mobileOverrides) && business.mobileOverrides.length > 0);
    const mobilePayload = hasMobile ? await renderPayload(resolveMobilePayload(original), true) : undefined;
    return { id: block.id, type: block.type, schemaVersion: 1, payload, ...(mobilePayload ? { mobilePayload } : {}), presentation: block.presentation || {}, ...(block.formId ? { formId: block.formId } : {}) };
  }));
  return { schemaVersion: 1, pageId, businessConfigured: Boolean(state.blocks["business-info"]), business: desktopPayload(business), ...(Array.isArray(business.mobileOverrides) && business.mobileOverrides.length ? { mobileBusiness: resolveMobilePayload(business) } : {}), blocks: blocks.filter(block => block !== null) };
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
  if (type === "featured") return { ...absolutizeRows(payload, "items", "imageUrl"), imageUrl: publicMediaUrl(payload.imageUrl) };
  if (type === "team" || type === "directory") return absolutizeRows(payload, "items", "imageUrl");
  if (["about", "coupon", "featured", "mailingList"].includes(type)) return { ...payload, imageUrl: publicMediaUrl(payload.imageUrl) };
  return payload;
}
