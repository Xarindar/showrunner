"use server";

import { BlogPostStatus, MediaVariantType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sanitizeHtml from "sanitize-html";
import { getOwnerStaffIds, requireAdmin, resolveDataScopeMode } from "@/lib/auth";
import { mediaAssetDisplayUrl, uploadMedia } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { sanitizeBlogHtml } from "./sanitize";

export async function saveBlogPostAction(formData: FormData) {
  const user = await requireAdmin("blog:manage");
  const settings = await getSiteSettings();
  const id = text(formData.get("id"));
  const title = text(formData.get("title")).slice(0, 180);
  const excerpt = text(formData.get("excerpt")).slice(0, 320);
  const authorName = text(formData.get("authorName")).slice(0, 120);
  const requestedCategoryId = text(formData.get("categoryId"));
  const newCategoryName = text(formData.get("newCategoryName")).slice(0, 80);
  const tags = uniqueTags(text(formData.get("tags")));
  const contentHtml = sanitizeBlogHtml(text(formData.get("contentHtml")));
  const intent = text(formData.get("intent"));
  const currentStatus = text(formData.get("currentStatus")) === BlogPostStatus.PUBLISHED
    ? BlogPostStatus.PUBLISHED
    : BlogPostStatus.DRAFT;
  const status = intent === "publish"
    ? BlogPostStatus.PUBLISHED
    : intent === "draft"
      ? BlogPostStatus.DRAFT
      : currentStatus;

  if (!title) fail(id, "Add a story title before saving.");
  if (status === BlogPostStatus.PUBLISHED && plainText(contentHtml).length < 40) {
    fail(id, "Add at least a short paragraph before publishing.");
  }

  const existing = id
    ? await prisma.blogPost.findFirst({ where: { id, siteId: settings.siteId } })
    : null;
  if (id && !existing) fail("", "That story could not be found.");
  const slug = existing?.slug || await availableBlogSlug(settings.siteId, title);
  const categoryId = await resolveBlogCategory(settings.siteId, requestedCategoryId, newCategoryName);

  const thumbnailUploadUrl = await uploadBlogImage(formData.get("thumbnailUpload"), {
    folder: "blog/thumbnails",
    title,
    usage: "blog listing thumbnail",
    variant: MediaVariantType.CARD,
    settings,
    user
  });
  const headerUploadUrl = await uploadBlogImage(formData.get("headerImageUpload"), {
    folder: "blog/headers",
    title,
    usage: "blog article header",
    variant: MediaVariantType.HERO,
    settings,
    user
  });
  const thumbnailUrl = thumbnailUploadUrl || storableImageUrl(text(formData.get("thumbnailUrl")));
  const headerImageUrl = headerUploadUrl || storableImageUrl(text(formData.get("headerImageUrl")));
  const publishedAt = status === BlogPostStatus.PUBLISHED
    ? existing?.publishedAt || new Date()
    : null;

  try {
    if (existing) {
      await prisma.blogPost.update({
        where: { id: existing.id },
        data: {
          authorName,
          categoryId,
          contentHtml,
          excerpt,
          headerImageUrl,
          publishedAt,
          slug,
          status,
          tags,
          thumbnailUrl,
          title
        }
      });
    } else {
      await prisma.blogPost.create({
        data: {
          authorName,
          categoryId,
          contentHtml,
          excerpt,
          headerImageUrl,
          publishedAt,
          siteId: settings.siteId,
          slug,
          status,
          tags,
          thumbnailUrl,
          title
        }
      });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      fail(id, "A unique story URL could not be generated. Save again to retry.");
    }
    throw error;
  }

  refreshBlog();
  redirect(`/admin/modules/blog?saved=${status === BlogPostStatus.PUBLISHED ? "published" : "draft"}`);
}

export async function deleteBlogPostAction(formData: FormData) {
  await requireAdmin("blog:manage");
  const settings = await getSiteSettings();
  const id = text(formData.get("id"));
  if (id) await prisma.blogPost.deleteMany({ where: { id, siteId: settings.siteId } });
  refreshBlog();
  redirect("/admin/modules/blog?saved=deleted");
}

function refreshBlog() {
  revalidatePath("/admin/modules/blog");
  revalidatePath("/api/public/v1/blog");
  revalidatePath("/sitemap.xml");
}

async function uploadBlogImage(
  value: FormDataEntryValue | null,
  input: {
    folder: string;
    settings: Awaited<ReturnType<typeof getSiteSettings>>;
    title: string;
    usage: string;
    user: Awaited<ReturnType<typeof requireAdmin>>;
    variant: MediaVariantType;
  }
) {
  if (!(value instanceof File) || value.size === 0) return "";
  const ownerStaffIds = await getOwnerStaffIds(input.user, input.settings.siteId);
  if ((await resolveDataScopeMode(input.user, input.settings.siteId, "media")) === "OWN" && !ownerStaffIds.length) {
    throw new Error("Create an active staff profile before uploading scoped blog media.");
  }
  const asset = await uploadMedia(
    value,
    {
      alt: input.title,
      folder: input.folder,
      tags: ["blog"],
      uploadedByStaffId: ownerStaffIds[0],
      usageContext: input.usage
    },
    input.settings.mediaDriver,
    input.settings.siteId
  );
  return mediaAssetDisplayUrl(asset, input.variant);
}

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function plainText(value: string) {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

async function availableBlogSlug(siteId: string, title: string) {
  const base = slugify(title) || "story";
  const matches = await prisma.blogPost.findMany({
    where: { siteId, slug: { startsWith: base } },
    select: { slug: true }
  });
  const used = new Set(matches.map((post) => post.slug));
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const candidate = `${base.slice(0, 180 - String(suffix).length - 1)}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base.slice(0, 164)}-${Date.now()}`;
}

async function resolveBlogCategory(siteId: string, requestedId: string, newName: string) {
  if (newName) {
    const slug = slugify(newName) || "category";
    const existing = await prisma.blogCategory.findUnique({
      where: { siteId_slug: { siteId, slug } },
      select: { id: true }
    });
    if (existing) return existing.id;
    const sortOrder = await prisma.blogCategory.count({ where: { siteId } });
    const category = await prisma.blogCategory.create({
      data: { name: newName, siteId, slug, sortOrder },
      select: { id: true }
    });
    return category.id;
  }
  if (!requestedId) return null;
  const category = await prisma.blogCategory.findFirst({
    where: { id: requestedId, siteId },
    select: { id: true }
  });
  return category?.id || null;
}

function uniqueTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean)
        .slice(0, 12)
    )
  );
}

function storableImageUrl(value: string) {
  return value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://") ? value : "";
}

function fail(id: string, message: string): never {
  const edit = id ? `post=${encodeURIComponent(id)}` : "new=1";
  redirect(`/admin/modules/blog?${edit}&error=${encodeURIComponent(message)}`);
}
