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
  const changed = await prisma.$executeRaw`
    INSERT INTO "PublicRateLimit" ("id", "siteId", "key", "scope", "identifier", "count", "windowStart", "updatedAt")
    VALUES (${crypto.randomUUID()}, ${siteId}, ${key}, ${scope}, ${identifier}, 1, timezone('UTC', statement_timestamp()), timezone('UTC', statement_timestamp()))
    ON CONFLICT ("siteId", "key") DO UPDATE
    SET "count" = CASE WHEN "PublicRateLimit"."windowStart" <= timezone('UTC', statement_timestamp()) - ${windowMinutes} * interval '1 minute'
                       THEN 1 ELSE "PublicRateLimit"."count" + 1 END,
        "windowStart" = CASE WHEN "PublicRateLimit"."windowStart" <= timezone('UTC', statement_timestamp()) - ${windowMinutes} * interval '1 minute'
                             THEN timezone('UTC', statement_timestamp()) ELSE "PublicRateLimit"."windowStart" END,
        "updatedAt" = timezone('UTC', statement_timestamp())
    WHERE "PublicRateLimit"."count" < ${limit}
       OR "PublicRateLimit"."windowStart" <= timezone('UTC', statement_timestamp()) - ${windowMinutes} * interval '1 minute'
  `;
  return changed ? "" : `Too many submissions. Try again in ${windowMinutes} minutes.`;
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
