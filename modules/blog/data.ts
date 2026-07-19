import "server-only";

import { BlogPostStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type BlogPostDraft = {
  authorName: string;
  category: string;
  contentHtml: string;
  excerpt: string;
  headerImageUrl: string;
  id: string;
  publishedAt: string;
  slug: string;
  status: BlogPostStatus;
  tags: string[];
  thumbnailUrl: string;
  title: string;
  updatedAt: string;
};

export async function getBlogPosts(siteId: string): Promise<BlogPostDraft[]> {
  const posts = await prisma.blogPost.findMany({
    where: { siteId },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      authorName: true,
      category: true,
      contentHtml: true,
      excerpt: true,
      headerImageUrl: true,
      id: true,
      publishedAt: true,
      slug: true,
      status: true,
      tags: true,
      thumbnailUrl: true,
      title: true,
      updatedAt: true
    }
  });

  return posts.map((post) => ({
    ...post,
    publishedAt: post.publishedAt?.toISOString() || "",
    tags: stringArray(post.tags),
    updatedAt: post.updatedAt.toISOString()
  }));
}

export const emptyBlogPost: BlogPostDraft = {
  authorName: "",
  category: "",
  contentHtml: "",
  excerpt: "",
  headerImageUrl: "",
  id: "",
  publishedAt: "",
  slug: "",
  status: BlogPostStatus.DRAFT,
  tags: [],
  thumbnailUrl: "",
  title: "",
  updatedAt: ""
};

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}
