import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await prisma.$queryRaw`SELECT 1`;
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" } }
  );
}
