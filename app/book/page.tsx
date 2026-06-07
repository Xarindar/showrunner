import { BookingPageShell } from "./booking-page-shell";

export const dynamic = "force-dynamic";

type BookPageProps = {
  searchParams: Promise<{ service?: string }>;
};

export default async function BookPage({ searchParams }: BookPageProps) {
  const { service } = await searchParams;
  return <BookingPageShell initialServiceSlug={service} />;
}
