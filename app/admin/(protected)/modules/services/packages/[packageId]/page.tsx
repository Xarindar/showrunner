import ServicePackageEditPage from "@/modules/scheduling/package-edit-page";

export const dynamic = "force-dynamic";

type AdminServicePackageEditRouteProps = {
  params: Promise<{ packageId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
};

export default async function AdminServicePackageEditRoute({ params, searchParams }: AdminServicePackageEditRouteProps) {
  const { packageId } = await params;
  return <ServicePackageEditPage packageId={packageId} searchParams={searchParams} />;
}
