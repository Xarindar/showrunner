import { PublicGalleryView } from "../../public-gallery-view";

export const dynamic = "force-dynamic";

type GalleryAccessPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GalleryAccessPage({ params, searchParams }: GalleryAccessPageProps) {
  const [{ token }, query] = await Promise.all([params, searchParams]);

  return <PublicGalleryView accessToken={token} searchParams={query} />;
}
