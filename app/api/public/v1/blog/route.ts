import { BlogPostStatus } from "@prisma/client";
import type { NextRequest } from "next/server";
import { authorizeEmbedRequest, embedError, embedJson, handleEmbedPreflight, type EmbedContext } from "@/lib/embed/gateway";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return handleEmbedPreflight(request);
}

export async function GET(request: NextRequest) {
  let context: EmbedContext | null = null;
  try {
    context = await authorizeEmbedRequest(request, {
      requireModuleId: "blog",
      scope: "blog:read",
      rateLimit: { limit: 60, windowMinutes: 1 }
    });
    const posts = await prisma.blogPost.findMany({
      where: {
        siteId: context.siteId,
        status: BlogPostStatus.PUBLISHED,
        publishedAt: { lte: new Date() }
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        authorName: true,
        category: { select: { name: true, slug: true } },
        excerpt: true,
        publishedAt: true,
        slug: true,
        tags: true,
        thumbnailUrl: true,
        title: true,
        updatedAt: true
      }
    });

    return embedJson({
      posts: posts.map(({ category, ...post }) => ({
        ...post,
        category: category?.name || "",
        categorySlug: category?.slug || "",
        publishedAt: post.publishedAt?.toISOString() || null,
        tags: Array.isArray(post.tags) ? post.tags : [],
        updatedAt: post.updatedAt.toISOString()
      }))
    }, context);
  } catch (error) {
    return embedError(error, { origin: context?.origin ?? null });
  }
}
