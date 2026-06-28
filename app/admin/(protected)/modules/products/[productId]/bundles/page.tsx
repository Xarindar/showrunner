import ProductBundlePage from "@/modules/products/bundle-page";

export const dynamic = "force-dynamic";

type AdminProductBundleRouteProps = {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
};

export default async function AdminProductBundleRoute({ params, searchParams }: AdminProductBundleRouteProps) {
  const { productId } = await params;
  return <ProductBundlePage productId={productId} searchParams={searchParams} />;
}
