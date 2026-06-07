import { BookingPageShell } from "../booking-page-shell";

export const dynamic = "force-dynamic";

type ServiceBookingPageProps = {
  params: Promise<{ serviceSlug: string }>;
};

export default async function ServiceBookingPage({ params }: ServiceBookingPageProps) {
  const { serviceSlug } = await params;
  return <BookingPageShell initialServiceSlug={serviceSlug} />;
}
