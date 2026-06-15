import "server-only";

import crypto from "node:crypto";
import type { SiteApiKey } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_EMBED_SCOPES, normalizeScopes, type EmbedScope } from "@/lib/embed/scopes";

// Publishable key prefix — safe to expose in browser embeds (like a Stripe pk_). The real
// access boundary is the per-key allowedOrigins allowlist enforced by the gateway, not secrecy.
const PUBLIC_KEY_PREFIX = "pk_live_";

export function generatePublicKey() {
  return PUBLIC_KEY_PREFIX + crypto.randomBytes(24).toString("base64url");
}

// An origin is scheme://host[:port] with no path/query/fragment. We normalize to URL.origin so an
// allowlist comparison is exact and case-insensitive, and reject anything that isn't http(s).
export function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeOrigins(values: unknown): string[] {
  const raw = Array.isArray(values) ? values.map(String) : [];
  const cleaned: string[] = [];
  for (const value of raw) {
    const origin = normalizeOrigin(value);
    if (origin) cleaned.push(origin);
  }
  return Array.from(new Set(cleaned));
}

// Accepts a textarea/CSV blob of origins (newline/comma/space separated) from the admin form.
export function parseOriginsInput(input: string): string[] {
  return normalizeOrigins(input.split(/[\s,]+/));
}

export type SiteApiKeyView = {
  id: string;
  name: string;
  publicKey: string;
  allowedOrigins: string[];
  scopes: EmbedScope[];
  enabled: boolean;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export function toSiteApiKeyView(key: SiteApiKey): SiteApiKeyView {
  return {
    id: key.id,
    name: key.name,
    publicKey: key.publicKey,
    allowedOrigins: normalizeOrigins(key.allowedOrigins),
    scopes: normalizeScopes(key.scopes),
    enabled: key.enabled && !key.revokedAt,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
    createdAt: key.createdAt
  };
}

export async function listSiteApiKeys(siteId: string): Promise<SiteApiKeyView[]> {
  const rows = await prisma.siteApiKey.findMany({
    where: { siteId },
    orderBy: { createdAt: "desc" }
  });
  return rows.map(toSiteApiKeyView);
}

export async function createSiteApiKey(input: {
  siteId: string;
  name: string;
  allowedOrigins: string[];
  scopes?: EmbedScope[];
}): Promise<SiteApiKeyView> {
  const requestedScopes = input.scopes ? normalizeScopes(input.scopes) : [];
  const row = await prisma.siteApiKey.create({
    data: {
      siteId: input.siteId,
      name: input.name.trim().slice(0, 120),
      publicKey: generatePublicKey(),
      allowedOrigins: normalizeOrigins(input.allowedOrigins),
      scopes: requestedScopes.length ? requestedScopes : DEFAULT_EMBED_SCOPES
    }
  });
  return toSiteApiKeyView(row);
}

// All mutations are site-scoped via updateMany so a key can only be changed within its own
// site (no IDOR even if a keyId from another tenant is posted).
export async function revokeSiteApiKey(siteId: string, keyId: string) {
  return prisma.siteApiKey.updateMany({
    where: { id: keyId, siteId },
    data: { enabled: false, revokedAt: new Date() }
  });
}

export async function updateSiteApiKeyOrigins(siteId: string, keyId: string, allowedOrigins: string[]) {
  return prisma.siteApiKey.updateMany({
    where: { id: keyId, siteId },
    data: { allowedOrigins: normalizeOrigins(allowedOrigins) }
  });
}

export async function resolveActiveSiteApiKey(publicKey: string) {
  const trimmed = publicKey.trim();
  if (!trimmed) return null;
  const key = await prisma.siteApiKey.findUnique({ where: { publicKey: trimmed } });
  if (!key || !key.enabled || key.revokedAt) return null;
  return key;
}

export async function touchSiteApiKeyUsage(keyId: string) {
  await prisma.siteApiKey
    .update({ where: { id: keyId }, data: { lastUsedAt: new Date() } })
    .catch(() => {
      // best-effort usage stamp; never block a request on it
    });
}
