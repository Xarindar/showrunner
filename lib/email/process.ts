import { EmailOutboxStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { createSmtpProvider } from "./provider";
import { cleanError, jsonHeaders } from "./shared";
import type { EmailProvider, ProcessEmailOutboxResult } from "./types";

const retryDelaysMinutes = [5, 30, 120, 720, 1440];
const maxAttempts = retryDelaysMinutes.length + 1;

type ClaimedRow = {
  id: string;
};

function nextAttemptDate(previousAttemptCount: number) {
  const minutes = retryDelaysMinutes[Math.min(previousAttemptCount, retryDelaysMinutes.length - 1)];
  const next = new Date();
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

function messageId(rowId: string, fromEmail: string) {
  const domain = fromEmail.split("@")[1]?.replace(/[^a-zA-Z0-9.-]/g, "") || "showrunner.local";
  return `<${rowId}@${domain}>`;
}

async function claimRows(limit: number) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ClaimedRow[]>`
      SELECT "id"
      FROM "EmailOutbox"
      WHERE (
        "status" = 'QUEUED'::"EmailOutboxStatus"
        AND "nextAttemptAt" <= CURRENT_TIMESTAMP
      ) OR (
        "status" = 'SENDING'::"EmailOutboxStatus"
        AND "updatedAt" < CURRENT_TIMESTAMP - interval '15 minutes'
      )
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;
    const ids = rows.map((row) => row.id);

    if (ids.length) {
      await tx.emailOutbox.updateMany({
        where: { id: { in: ids } },
        data: { status: EmailOutboxStatus.SENDING }
      });
    }

    return ids;
  });
}

export async function processEmailOutbox(options: { limit?: number; provider?: EmailProvider } = {}): Promise<ProcessEmailOutboxResult> {
  const limit = Math.max(1, Math.min(options.limit || 50, 200));
  const provider = options.provider || createSmtpProvider();
  const ids = await claimRows(limit);
  const rows = ids.length
    ? await prisma.emailOutbox.findMany({
        where: { id: { in: ids } },
        orderBy: { createdAt: "asc" }
      })
    : [];

  const result: ProcessEmailOutboxResult = {
    processed: rows.length,
    sent: 0,
    failed: 0,
    retried: 0,
    suppressed: 0,
    skipped: Math.max(0, ids.length - rows.length)
  };

  for (const row of rows) {
    try {
      const stableMessageId = messageId(row.id, row.fromEmail);
      const sendResult = await provider.sendEmail({
        messageId: stableMessageId,
        fromName: row.fromName,
        fromEmail: row.fromEmail,
        replyToEmail: row.replyToEmail || undefined,
        toEmail: row.recipientEmail,
        toName: row.recipientName || undefined,
        subject: row.subject,
        htmlBody: row.htmlBody,
        textBody: row.textBody,
        headers: jsonHeaders(row.headers)
      });

      await prisma.emailOutbox.update({
        where: { id: row.id },
        data: {
          status: EmailOutboxStatus.SENT,
          attemptCount: row.attemptCount + 1,
          providerMessageId: sendResult.providerMessageId || stableMessageId,
          sentAt: new Date(),
          lastError: ""
        }
      });
      result.sent += 1;
    } catch (error) {
      const attemptCount = row.attemptCount + 1;
      const failed = attemptCount >= maxAttempts;

      await prisma.emailOutbox.update({
        where: { id: row.id },
        data: {
          status: failed ? EmailOutboxStatus.FAILED : EmailOutboxStatus.QUEUED,
          attemptCount,
          nextAttemptAt: failed ? row.nextAttemptAt : nextAttemptDate(row.attemptCount),
          lastError: cleanError(error)
        }
      });

      if (failed) result.failed += 1;
      else result.retried += 1;
    }
  }

  return result;
}
