import ProductEditPage from "@/modules/products/edit-page";

export const dynamic = "force-dynamic";

type AdminProductEditRouteProps = {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
};

export default async function AdminProductEditRoute({ params, searchParams }: AdminProductEditRouteProps) {
  const { productId } = await params;
  return <ProductEditPage productId={productId} searchParams={searchParams} />;
}
