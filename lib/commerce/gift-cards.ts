import "server-only";

import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";

type GiftCardCodeClient = Pick<Prisma.TransactionClient, "giftCard">;

function randomGiftCardSegment() {
  return randomBytes(3).toString("hex").toUpperCase();
}

export async function generateGiftCardCode(client: GiftCardCodeClient, siteId: string, requestedCode?: string) {
  const normalizedRequestedCode = requestedCode?.trim().toUpperCase();
  if (normalizedRequestedCode) return normalizedRequestedCode;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `GC-${randomGiftCardSegment()}-${randomGiftCardSegment()}-${randomGiftCardSegment()}`;
    const existing = await client.giftCard.findUnique({
      where: { siteId_code: { siteId, code } },
      select: { id: true }
    });
    if (!existing) return code;
  }

  throw new Error("Could not generate a unique gift card code.");
}
