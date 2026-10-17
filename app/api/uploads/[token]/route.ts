import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { getModule } from "@/shell/modules";
import { publicRateLimitForSite } from "@/lib/public-rate-limit";
import { uploadInput, maxRequestBytes, maxRequestFiles, requestIsOpen } from "@/lib/uploads/validation";
import { signOriginalUpload, originalSize } from "@/lib/uploads/storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const settings = await getSiteSettings();
  const { token } = await context.params;
  const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!getModule("uploads") || !settings.enabledModuleIds.includes("uploads")) return reply({ error: "Uploads are unavailable." }, 404);
  if (request.headers.get("origin") !== request.nextUrl.origin) return reply({ error: "Open your upload link to send files." }, 403);
  if (Number(request.headers.get("content-length") || 0) > 4096) return reply({ error: "Request is too large." }, 413);
  const uploadRequest = await prisma.uploadRequest.findFirst({ where: { token, siteId: settings.siteId } });
  if (!uploadRequest) return reply({ error: "This upload link is unavailable." }, 404);
  try {
    const raw = await request.text();
    if (raw.length > 4096) return reply({ error: "Request is too large." }, 413);
    const input = JSON.parse(raw);
    // Completion remains available after closing: files already in flight can finish safely.
    if (input.action === "complete") {
      if (typeof input.id !== "string") return reply({ error: "Invalid file." }, 400);
      const file = await prisma.clientUpload.findFirst({ where: { id: input.id, requestId: uploadRequest.id } });
      if (!file) return reply({ error: "File not found." }, 404);
      if (!file.completedAt) {
        if (await originalSize(file.objectKey) !== file.sizeBytes) return reply({ error: "The upload is incomplete. Please retry." }, 409);
        await prisma.clientUpload.update({ where: { id: file.id }, data: { completedAt: new Date() } });
      }
      return reply({ received: true });
    }
    if (!requestIsOpen(uploadRequest)) return reply({ error: "This upload link has closed or expired." }, 410);
    const limited = await publicRateLimitForSite(settings.siteId, "client-upload", { limit: 600, windowMinutes: 60 });
    if (limited) return reply({ error: limited }, 429);
    if (input.action === "retry") {
      if (typeof input.id !== "string") return reply({ error: "Invalid file." }, 400);
      const file = await prisma.clientUpload.findFirst({ where: { id: input.id, requestId: uploadRequest.id, completedAt: null } });
      if (!file) return reply({ error: "File not found." }, 404);
      return reply({ id: file.id, url: await signOriginalUpload(file.objectKey, file.sizeBytes) });
    }
    const parsed = uploadInput.safeParse(input);
    if (!parsed.success) return reply({ error: "Enter your name and email, and choose a file under 250 MB with a valid filename." }, 400);
    const file = await prisma.$transaction(async (tx) => {
      const reserved = await tx.uploadRequest.updateMany({ where: {
        id: uploadRequest.id, siteId: settings.siteId, closedAt: null, expiresAt: { gt: new Date() },
        fileCount: { lt: maxRequestFiles }, reservedBytes: { lte: maxRequestBytes - BigInt(parsed.data.sizeBytes) }
      }, data: { fileCount: { increment: 1 }, reservedBytes: { increment: parsed.data.sizeBytes } } });
      if (!reserved.count) return null;
      return tx.clientUpload.create({ data: { ...parsed.data, requestId: uploadRequest.id,
        objectKey: `client-uploads/${settings.siteId}/${uploadRequest.id}/${randomUUID()}` } });
    });
    if (!file) return reply({ error: "This link is closed or has reached its upload limit. Contact Admit One for a new link." }, 409);
    return reply({ id: file.id });
  } catch (error) {
    console.error("Client upload failed", error);
    return reply({ error: "We could not finish this step. Your selected files are still here; please retry." }, 503);
  }
}
