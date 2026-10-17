import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";

export async function GET(request: NextRequest) {
  await requireAdmin("scheduling:manage");
  const { siteId } = await getSiteSettings();
  const params = request.nextUrl.searchParams;
  const q = (params.get("q") || "").trim().slice(0, 120);
  const category = (params.get("category") || "").slice(0, 120);
  const tag = (params.get("tag") || "").slice(0, 60);
  const requestedPage = Number(params.get("page") || 1);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1;
  const tags = await prisma.$queryRaw<Array<{ tag: string }>>`SELECT DISTINCT unnest("tags") AS tag FROM "ServiceLibraryItem" WHERE "siteId" = ${siteId} ORDER BY tag`;
  const where: Prisma.ServiceLibraryItemWhereInput = {
    siteId,
    ...(category ? { category } : {}),
    ...(tag ? { tags: { has: tag } } : {}),
    ...(q ? { OR: [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
      { tags: { hasSome: tags.filter(row => row.tag.includes(q.toLowerCase())).map(row => row.tag) } }
    ] } : {})
  };
  const [items, total, categories] = await Promise.all([
    prisma.serviceLibraryItem.findMany({ where, select: { id: true, name: true, description: true, category: true, tags: true }, orderBy: { nameKey: "asc" }, skip: (page - 1) * 20, take: 20 }),
    prisma.serviceLibraryItem.count({ where }),
    prisma.serviceLibraryItem.findMany({ where: { siteId, category: { not: "" } }, distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } })
  ]);
  return NextResponse.json({ items, total, categories: categories.map(row => row.category), tags: tags.map(row => row.tag), page, pageCount: Math.max(1, Math.ceil(total / 20)) }, { headers: { "Cache-Control": "private, no-store" } });
}
