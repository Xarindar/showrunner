import { readImageFraming } from "./image-framing";

export function resolveFeatured(row: Record<string, unknown>, service: { id: string; name: string; description?: string | null; imageUrl?: string | null; imageFraming?: unknown; framingUrl?: string; href?: string }) {
  const custom = row.imageSource === "custom" || Boolean(row.imageUrl);
  return { id: service.id, editorId: row.id, name: String(row.title || "").trim() || service.name,
    description: String(row.description || "").trim() || service.description || "",
    imageUrl: String((custom ? row.imageUrl : row.useServiceFraming === false ? service.framingUrl || service.imageUrl : service.imageUrl) || ""),
    ...readImageFraming(custom || row.useServiceFraming === false ? row : service.imageFraming), ctaHref: service.href || "" };
}
