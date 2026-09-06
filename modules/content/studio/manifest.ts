import { blockRegistry, emptyPayload, payloadSchema, type BlockType } from "./registry";

export type ContentBlockConfig = {
  id: string; type: BlockType; label: string; editableFields: string[];
  pageIds: string[]; allowPageTargeting?: boolean; limits?: Record<string, number>; minimums?: Record<string, number>;
  presentation?: { assetBaseUrl?: string; variant?: string; selector?: string; bindings?: { path: string; selector: string; attribute?: "src" | "alt" | "href" | "background" }[] }; source?: "services";
  fixedRows?: boolean;
  editorGroups?: { label: string; fields: { path: string; label: string }[] }[];
  sourceCategory?: string;
  formId?: string;
  defaults?: Record<string, unknown>;
};
export type ContentManifest = {
  version: 1; id: string; pages: { id: string; path: string; label: string }[];
  blocks: ContentBlockConfig[]; legacyProfiles?: boolean; previewUrl?: string;
  booking?: { path: string; profilesByCategory?: Record<string, string> };
};
export function validateManifest(manifest: ContentManifest): ContentManifest {
  const ids = new Set<string>();
  const pages = new Set(manifest.pages.map(page => page.id));
  if (pages.size !== manifest.pages.length) throw new Error("Duplicate page IDs");
  for (const block of manifest.blocks) {
    if (!/^[a-z0-9-]+$/.test(block.id) || ids.has(block.id)) throw new Error("Invalid or duplicate block ID");
    ids.add(block.id);
    const definition = blockRegistry[block.type];
    if (!definition) throw new Error("Unknown content block type");
    if (block.editableFields.some(field => !(field in definition.fields))) throw new Error("Unknown editable field");
    if (block.pageIds.some(page => !pages.has(page))) throw new Error("Unknown page binding");
    if (block.type === "seo" && block.pageIds.length !== 1) throw new Error("SEO must bind to one page");
    if (block.type === "business" && block.id !== "business-info") throw new Error("Canonical Business Info ID must be business-info");
    if (block.type === "featured" && !block.source) throw new Error("Featured items require a source");
    if (block.sourceCategory && block.source !== "services") throw new Error("Source categories require a service source");
    if (block.type === "mailingList" && !block.formId) throw new Error("Mailing-list popup requires a configured form");
    if (block.defaults) payloadSchema(block.type).parse({ ...emptyPayload(block.type), ...block.defaults });
    for (const [key, limit] of Object.entries(block.limits || {})) {
      const field = (definition.fields as Record<string, { kind: string; max?: number }>)[key];
      if (!field || field.kind !== "list" || !Number.isInteger(limit) || limit < 0 || limit > (field.max || 12)) throw new Error("Invalid item limit");
    }
    for (const [key, minimum] of Object.entries(block.minimums || {})) {
      const field = (definition.fields as Record<string, { kind: string; max?: number }>)[key];
      const maximum = block.limits?.[key] ?? field?.max ?? 12;
      if (!field || field.kind !== "list" || !Number.isInteger(minimum) || minimum < 0 || minimum > maximum) throw new Error("Invalid item minimum");
    }
  }
  if (manifest.blocks.filter(block => block.type === "business").length > 1) throw new Error("Business Info must have one source");
  return manifest;
}
export function configuredBlock(id: string, type: BlockType, pageIds: string[], extra: Partial<ContentBlockConfig> = {}): ContentBlockConfig {
  return { id, type, label: blockRegistry[type].label, editableFields: Object.keys(blockRegistry[type].fields), pageIds, ...extra };
}
export function blockDependenciesAvailable(block: ContentBlockConfig, enabledModules: readonly string[]) {
  return (!block.source || enabledModules.includes("scheduling")) && (block.type !== "mailingList" || enabledModules.includes("forms"));
}
