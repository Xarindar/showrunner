"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getSiteSettingsForSite, resolveCurrentSite } from "@/lib/site";
import { resolveContentManifest } from "@/clients/content-manifests";
import { configRecord, readStudio, saveRequestSchema, validateBlockUpdate } from "./state";
import { businessInfoExtensions, resolveBusinessInfo, validateBusinessInfo } from "./business-info";
import { blockDependenciesAvailable } from "./manifest";

export async function saveStudioBlock(raw: unknown): Promise<{ error?: string; revision?: number }> {
  const user = await requireAdmin("content:manage");
  const site = await resolveCurrentSite();
  const settings = await getSiteSettingsForSite(site.id);
  if (!settings.enabledModuleIds.includes("content")) return { error: "Content is not enabled" };
  try {
    const input = saveRequestSchema.parse(raw);
    const revision = await prisma.$transaction(async tx => {
      const current = await tx.siteSettings.findUniqueOrThrow({ where: { siteId: site.id } });
      const manifest = resolveContentManifest(site.id, current.publicContentConfig);
      const block = manifest.blocks.find(item => item.id === input.id);
      if (!block) throw new Error("This content editor is not configured for your site");
      if (!blockDependenciesAvailable(block, settings.enabledModuleIds)) throw new Error("A required content integration is not enabled");
      if (block.formId && !await tx.form.findFirst({ where: { id: block.formId, siteId: site.id, status: "ACTIVE" }, select: { id: true } })) throw new Error("The configured form is unavailable");
      const studio = readStudio(current.publicContentConfig);
      const stored = studio.blocks[block.id];
      const baseline = block.type === "business" ? { schemaVersion: 1 as const, revision: stored?.revision || 0, payload: resolveBusinessInfo(current), pageIds: [], updatedAt: stored?.updatedAt || "", updatedBy: stored?.updatedBy || "" } : stored;
      const { payload, pageIds } = validateBlockUpdate(block, baseline, input);
      if (block.type === "business") validateBusinessInfo(payload);
      if (block.type === "contact") {
        const locations = resolveBusinessInfo(current).locations as { id: string }[];
        if (payload.locationId && !locations.some(location => location.id === payload.locationId)) throw new Error("Unknown location");
      }
      if (block.source === "services") {
        const ids = (payload.items as { referenceId: string }[]).map(item => item.referenceId);
        if (new Set(ids).size !== ids.length) throw new Error("Select each item only once");
        const count = await tx.service.count({ where: { siteId: site.id, isActive: true, id: { in: ids } } });
        if (count !== ids.length) throw new Error("A selected service is unavailable for this site");
      }
      const nextRevision = (stored?.revision || 0) + 1;
      studio.blocks[block.id] = { schemaVersion: 1, revision: nextRevision, payload: block.type === "business" ? businessInfoExtensions(payload) : payload, pageIds, updatedAt: new Date().toISOString(), updatedBy: user.id };
      // Compare-and-swap the whole JSON document to avoid losing unrelated simultaneous edits.
      const result = await tx.siteSettings.updateMany({
        where: { siteId: site.id, updatedAt: current.updatedAt },
        data: {
          publicContentConfig: { ...configRecord(current.publicContentConfig), studio } as Prisma.InputJsonObject,
          ...(block.type === "business" ? { businessName: String(payload.businessName), contactEmail: String(payload.email), timezone: String(payload.timezone) } : {}),
        },
      });
      if (result.count !== 1) throw new Error("Site content changed while saving. Your edits are still here; reload before retrying.");
      return nextRevision;
    });
    await recordAuditLog({ action: "content.updated", targetType: "ContentInstance", targetId: input.id, actor: user, siteId: site.id, metadata: { revision } });
    revalidatePath("/", "layout");
    return { revision };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Content could not be saved" };
  }
}
