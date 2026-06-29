import ServiceEditPage from "@/modules/scheduling/edit-page";

export const dynamic = "force-dynamic";

type AdminServiceEditRouteProps = {
  params: Promise<{ serviceId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; tab?: string }>;
};

export default async function AdminServiceEditRoute({ params, searchParams }: AdminServiceEditRouteProps) {
  const { serviceId } = await params;
  return <ServiceEditPage serviceId={serviceId} searchParams={searchParams} />;
}
