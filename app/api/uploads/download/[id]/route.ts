import { NextResponse } from "next/server";
import { requireUploadAdmin } from "@/lib/uploads/access";
import { prisma } from "@/lib/prisma";
import { signOriginalDownload } from "@/lib/uploads/storage";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { siteId } = await requireUploadAdmin();
  const { id } = await context.params;
  const file = await prisma.clientUpload.findFirst({ where: { id, completedAt: { not: null }, request: { siteId } } });
  if (!file) return new NextResponse("File not found", { status: 404 });
  const response = NextResponse.redirect(await signOriginalDownload(file.objectKey, file.filename));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
