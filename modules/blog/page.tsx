import { MediaDriver } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { globalMediaAssets } from "@/lib/global-media-assets";
import { isMediaUploadDriverConfigured } from "@/lib/media";
import { getSiteSettings } from "@/lib/site";
import { deleteBlogPostAction, saveBlogPostAction } from "./actions";
import { BlogEditor } from "./blog-editor";
import { emptyBlogPost, getBlogPosts } from "./data";

export const dynamic = "force-dynamic";

type BlogPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function BlogPage({ searchParams }: BlogPageProps) {
  await requireAdmin("blog:manage");
  const [params, settings] = await Promise.all([searchParams, getSiteSettings()]);
  const posts = await getBlogPosts(settings.siteId);
  const selected = params.post ? posts.find((post) => post.id === params.post) : null;
  const editing = Boolean(params.new || selected);
  const mediaAssets = globalMediaAssets.map((asset) => ({
    alt: asset.alt,
    filename: asset.filename,
    id: asset.id,
    source: "global" as const,
    tags: asset.tags,
    thumbnailUrl: asset.thumbnailUrl,
    url: asset.url
  }));

  return (
    <div className="stack blog-studio">
      <header className="page-header blog-page-header">
        <div>
          <h1>Blog</h1>
        </div>
      </header>

      {params.saved ? <div className="success-message">{savedMessage(params.saved)}</div> : null}
      {params.error ? <div className="error">{decodeURIComponent(params.error)}</div> : null}

      <BlogEditor
        canUpload={canUploadWithDriver(settings.mediaDriver)}
        deleteAction={deleteBlogPostAction}
        editing={editing}
        mediaAssets={mediaAssets}
        post={selected || emptyBlogPost}
        posts={posts}
        saveAction={saveBlogPostAction}
      />
    </div>
  );
}

function canUploadWithDriver(driver: MediaDriver) {
  return isMediaUploadDriverConfigured(driver);
}

function savedMessage(value: string) {
  if (value === "published") return "Story published.";
  if (value === "draft") return "Draft saved.";
  if (value === "deleted") return "Story deleted.";
  return "Blog updated.";
}
