import "server-only";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ensureDefaultSite, getCurrentSiteId } from "@/lib/site";
import { DEFAULT_SITE_ID } from "@/lib/site-boundary";

type PublicRateLimitOptions = {
  identifier?: string;
  limit?: number;
  windowMinutes?: number;
};

export function firstForwardedIp(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function rateLimitKey(scope: string, identifier: string, siteId: string) {
  return crypto.createHash("sha256").update(`${siteId}:${scope}:${identifier}`).digest("hex");
}

async function publicIdentifier() {
  const headerStore = await headers();
  return publicIdentifierFromHeaders(headerStore);
}

export function publicIdentifierFromHeaders(headerStore: Pick<Headers, "get">) {
  return (
    firstForwardedIp(headerStore.get("x-forwarded-for")) ||
    headerStore.get("x-real-ip")?.trim() ||
    headerStore.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

// Site-explicit limiter: the embed/public-API gateway resolves the site from the API key,
// not the request hostname, so it can't use publicRateLimitMessage (which calls getCurrentSiteId).
// The hostname-resolving function below delegates here so there is a single limiter implementation.
export async function publicRateLimitForSite(siteId: string, scope: string, options: PublicRateLimitOptions = {}) {
  const limit = options.limit ?? 8;
  const windowMinutes = options.windowMinutes ?? 10;
  const identifier = options.identifier || (await publicIdentifier());
  const key = rateLimitKey(scope, identifier, siteId);
  const now = new Date();
  const windowMs = windowMinutes * 60 * 1000;
  const existing = await prisma.publicRateLimit.findUnique({ where: { siteId_key: { siteId, key } } });

  if (!existing || now.getTime() - existing.windowStart.getTime() >= windowMs) {
    await prisma.publicRateLimit.upsert({
      where: { siteId_key: { siteId, key } },
      update: {
        count: 1,
        windowStart: now,
        scope,
        identifier
      },
      create: {
        siteId,
        key,
        scope,
        identifier,
        count: 1,
        windowStart: now
      }
    });
    return "";
  }

  if (existing.count >= limit) {
    return `Too many submissions. Try again in ${windowMinutes} minutes.`;
  }

  await prisma.publicRateLimit.update({
    where: { siteId_key: { siteId, key } },
    data: { count: { increment: 1 } }
  });
  return "";
}

export async function publicRateLimitMessage(scope: string, options: PublicRateLimitOptions = {}) {
  const siteId = await getCurrentSiteId();
  return publicRateLimitForSite(siteId, scope, options);
}

export async function publicGlobalRateLimitMessage(
  scope: string,
  headerStore: Pick<Headers, "get">,
  options: Omit<PublicRateLimitOptions, "identifier"> = {}
) {
  await ensureDefaultSite();
  return publicRateLimitForSite(DEFAULT_SITE_ID, `global:${scope}`, {
    ...options,
    identifier: publicIdentifierFromHeaders(headerStore)
  });
}
