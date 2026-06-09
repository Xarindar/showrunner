import { PublicGalleryView } from "../public-gallery-view";

export const dynamic = "force-dynamic";

type GalleryPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GalleryPage({ params, searchParams }: GalleryPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);

  return <PublicGalleryView searchParams={query} slug={slug} />;
}
