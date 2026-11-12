import { notFound } from "next/navigation";
import { getClientGalleryWorkspace } from "@/modules/portfolio/client-actions";
import { ClientSessionDetail } from "@/modules/clients/detail/client-galleries-card";

export const dynamic = "force-dynamic";

export default async function ClientSessionPage({ params, searchParams }: {
  params: Promise<{ id: string; sessionId: string }>;
  searchParams: Promise<{ upload?: string }>;
}) {
  const [{ id, sessionId }, query] = await Promise.all([params, searchParams]);
  const workspace = await getClientGalleryWorkspace(id);
  const booking = workspace.sessions.find(session => session.id === sessionId);
  const galleries = booking ? workspace.galleries.filter(gallery => gallery.bookingId === booking.id) : workspace.galleries.filter(gallery => gallery.id === sessionId);
  if (!booking && !galleries.length) notFound();
  return <ClientSessionDetail clientId={id} initialWorkspace={{ ...workspace, galleries, sessions: booking ? [booking] : [] }}
    initialBookingId={booking?.id || galleries[0]?.bookingId || ""} initialGalleryId={galleries[0]?.id || ""} openUpload={query.upload === "1"} />;
}
