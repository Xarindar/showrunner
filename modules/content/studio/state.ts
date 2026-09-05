import { z } from "zod";
import { emptyPayload, payloadSchema } from "./registry";
import type { ContentBlockConfig } from "./manifest";

export type StoredBlock = { schemaVersion: 1; revision: number; payload: Record<string, unknown>; pageIds: string[]; updatedAt: string; updatedBy: string };
export type StudioState = { version: 1; blocks: Record<string, StoredBlock> };
export function configRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function readStudio(value: unknown): StudioState {
  const studio = configRecord(configRecord(value).studio);
  if (studio.version !== undefined && studio.version !== 1) throw new Error("Unsupported content studio version");
  return { version: 1, blocks: configRecord(studio.blocks) as Record<string, StoredBlock> };
}
export const saveRequestSchema = z.strictObject({
  id: z.string(), revision: z.number().int().nonnegative(), payload: z.record(z.string(), z.unknown()), pageIds: z.array(z.string()).max(100),
});
export function validateBlockUpdate(block: ContentBlockConfig, current: StoredBlock | undefined, input: z.infer<typeof saveRequestSchema>) {
  if (input.id !== block.id) throw new Error("Unknown content instance");
  if ((current?.revision || 0) !== input.revision) throw new Error("This content changed in another session. Reload before saving; keep a copy of your edits.");
  for (const key of Object.keys(input.payload)) if (!block.editableFields.includes(key)) throw new Error(`Field ${key} is locked`);
  const payload = payloadSchema(block.type).parse({ ...emptyPayload(block.type), ...current?.payload, ...input.payload }) as Record<string, unknown>;
  // Existing rows retain their deployment order; clients may edit, remove, or append rows.
  for (const [key, value] of Object.entries(payload)) {
    const before = current?.payload[key];
    if (!Array.isArray(value) || !Array.isArray(before)) continue;
    const oldIds = before.map(row => row.id);
    const retained = value.map(row => row.id).filter(id => oldIds.includes(id));
    if (JSON.stringify(retained) !== JSON.stringify(oldIds.filter(id => retained.includes(id)))) throw new Error("Item ordering is configured by your site administrator");
  }
  for (const [key, limit] of Object.entries(block.limits || {})) if (Array.isArray(payload[key]) && payload[key].length > limit) throw new Error(`${key} allows at most ${limit} items`);
  if (new Set(input.pageIds).size !== input.pageIds.length || input.pageIds.some(id => !block.pageIds.includes(id))) throw new Error("Page is not allowed for this block");
  const existingPages = current?.pageIds || block.pageIds;
  if (!block.allowPageTargeting && JSON.stringify(input.pageIds) !== JSON.stringify(existingPages)) throw new Error("Page targeting is locked");
  return { payload, pageIds: input.pageIds };
}
