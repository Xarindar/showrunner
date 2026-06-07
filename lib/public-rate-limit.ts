import "server-only";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

type PublicRateLimitOptions = {
  limit?: number;
  windowMinutes?: number;
};

function firstForwardedIp(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function rateLimitKey(scope: string, identifier: string) {
  return crypto.createHash("sha256").update(`${scope}:${identifier}`).digest("hex");
}

async function publicIdentifier() {
  const headerStore = await headers();
  return (
    firstForwardedIp(headerStore.get("x-forwarded-for")) ||
    headerStore.get("x-real-ip")?.trim() ||
    headerStore.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

export async function publicRateLimitMessage(scope: string, options: PublicRateLimitOptions = {}) {
  const limit = options.limit ?? 8;
  const windowMinutes = options.windowMinutes ?? 10;
  const identifier = await publicIdentifier();
  const key = rateLimitKey(scope, identifier);
  const now = new Date();
  const windowMs = windowMinutes * 60 * 1000;
  const existing = await prisma.publicRateLimit.findUnique({ where: { key } });

  if (!existing || now.getTime() - existing.windowStart.getTime() >= windowMs) {
    await prisma.publicRateLimit.upsert({
      where: { key },
      update: {
        count: 1,
        windowStart: now,
        scope,
        identifier
      },
      create: {
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
    where: { key },
    data: { count: { increment: 1 } }
  });
  return "";
}
