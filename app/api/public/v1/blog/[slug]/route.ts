import { BlogPostStatus } from "@prisma/client";
import type { NextRequest } from "next/server";
import { authorizeEmbedRequest, embedError, embedJson, handleEmbedPreflight, type EmbedContext } from "@/lib/embed/gateway";
import { EmbedRequestError } from "@/lib/embed/gateway";
import { prisma } from "@/lib/prisma";
import { sanitizeBlogHtml } from "@/modules/blog/sanitize";

export const dynamic = "force-dynamic";

type BlogPostRouteProps = {
  params: Promise<{ slug: string }>;
};

export async function OPTIONS(request: NextRequest) {
  return handleEmbedPreflight(request);
}

export async function GET(request: NextRequest, { params }: BlogPostRouteProps) {
  let context: EmbedContext | null = null;
  try {
    context = await authorizeEmbedRequest(request, {
      requireModuleId: "blog",
      scope: "blog:read",
      rateLimit: { limit: 60, windowMinutes: 1 }
    });
    const { slug } = await params;
    const post = await prisma.blogPost.findFirst({
      where: {
        siteId: context.siteId,
        slug,
        status: BlogPostStatus.PUBLISHED,
        publishedAt: { lte: new Date() }
      },
      select: {
        authorName: true,
        category: { select: { name: true, slug: true } },
        contentHtml: true,
        excerpt: true,
        headerImageUrl: true,
        publishedAt: true,
        slug: true,
        tags: true,
        thumbnailUrl: true,
        title: true,
        updatedAt: true
      }
    });
    if (!post) throw new EmbedRequestError("Story not found.", 404);

    const { category, ...story } = post;
    return embedJson({
      post: {
        ...story,
        category: category?.name || "",
        categorySlug: category?.slug || "",
        contentHtml: sanitizeBlogHtml(post.contentHtml),
        publishedAt: post.publishedAt?.toISOString() || null,
        tags: Array.isArray(post.tags) ? post.tags : [],
        updatedAt: post.updatedAt.toISOString()
      }
    }, context);
  } catch (error) {
    return embedError(error, { origin: context?.origin ?? null });
  }
}
