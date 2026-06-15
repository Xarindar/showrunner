// Embed/public-API scopes. A SiteApiKey carries a subset of these; the gateway can require
// a specific scope per endpoint. Read scopes power widgets that only display data; write scopes
// gate actions that create records (and still run honeypot + rate limit + server-side validation).
export const EMBED_SCOPES = [
  "scheduling:read",
  "scheduling:write",
  "commerce:read",
  "commerce:write",
  "galleries:read",
  "forms:write"
] as const;

export type EmbedScope = (typeof EMBED_SCOPES)[number];

const EMBED_SCOPE_SET = new Set<string>(EMBED_SCOPES);

export const DEFAULT_EMBED_SCOPES: EmbedScope[] = ["scheduling:read"];

export function isEmbedScope(value: string): value is EmbedScope {
  return EMBED_SCOPE_SET.has(value);
}

export function normalizeScopes(values: unknown): EmbedScope[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<EmbedScope>();
  for (const value of values) {
    const scope = String(value);
    if (isEmbedScope(scope)) seen.add(scope);
  }
  return Array.from(seen);
}
