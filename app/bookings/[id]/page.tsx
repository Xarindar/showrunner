import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, MapPin } from "lucide-react";
import { verifyBookingSelfServiceToken } from "@/lib/bookings/self-service";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";
import { getZonedDateKey } from "@/lib/timezone";
import { SelfServicePanel } from "./self-service-panel";

export const dynamic = "force-dynamic";

type BookingSelfServicePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; token?: string }>;
};

function statusLabel(value: string) {
  return value.toLowerCase();
}

export default async function BookingSelfServicePage({ params, searchParams }: BookingSelfServicePageProps) {
  const [{ id }, { error, saved, token = "" }] = await Promise.all([params, searchParams]);
  const settings = await getSiteSettings();
  if (!settings.enabledModuleIds.includes("scheduling")) notFound();

  const booking = await prisma.booking.findFirst({
    where: { id, siteId: settings.siteId },
    include: {
      client: true,
      resources: { include: { resource: true }, orderBy: { resource: { name: "asc" } } },
      service: true,
      staff: true
    }
  });

  if (
    !booking ||
    !verifyBookingSelfServiceToken({
      bookingId: booking.id,
      customerEmail: booking.customerEmail,
      siteId: booking.siteId,
      token
    })
  ) {
    notFound();
  }

  const history = await prisma.booking.findMany({
    where: {
      siteId: settings.siteId,
      OR: [
        ...(booking.clientId ? [{ clientId: booking.clientId }] : []),
        { customerEmail: booking.customerEmail },
        { customerEmail: booking.customerEmail.toLowerCase() }
      ]
    },
    include: {
      resources: { include: { resource: true }, orderBy: { resource: { name: "asc" } } },
      service: true,
      staff: true
    },
    orderBy: { startsAt: "desc" },
    take: 25
  });
  const canManage = ["PENDING", "CONFIRMED"].includes(booking.status) && booking.startsAt > new Date();

  return (
    <main className="site-shell" style={themeToCssVars(settings)}>
      <nav className="site-nav">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{settings.businessName}</span>
        </Link>
        <Link href="/book" className="button secondary">
          Book
        </Link>
      </nav>

      <section className="booking-page">
        <div className="booking-intro">
          <p className="eyebrow">Appointment</p>
          <h1>Manage your appointment.</h1>
          <p className="lead">View your appointment details, choose a new available time, or cancel an upcoming appointment.</p>
        </div>

        {saved === "reschedule" ? <div className="success-message">Appointment rescheduled.</div> : null}
        {saved === "cancel" ? <div className="success-message">Appointment canceled.</div> : null}
        {error ? <div className="error">{error}</div> : null}

        <section className="grid-2">
          <div className="card">
            <h2 className="section-title">Current appointment</h2>
            <table className="table">
              <tbody>
                <tr>
                  <td>Status</td>
                  <td>
                    <span className="pill">{statusLabel(booking.status)}</span>
                  </td>
                </tr>
                <tr>
                  <td>Service</td>
                  <td>{booking.service.name}</td>
                </tr>
                <tr>
                  <td>Time</td>
                  <td>
                    <CalendarDays size={16} /> {formatDateTime(booking.startsAt, settings.timezone)}
                  </td>
                </tr>
                <tr>
                  <td>Duration</td>
                  <td>
                    <Clock size={16} /> {booking.service.durationMinutes} minutes
                  </td>
                </tr>
                <tr>
                  <td>Staff</td>
                  <td>{booking.staff?.name || "Assigned by the business"}</td>
                </tr>
                <tr>
                  <td>Resources</td>
                  <td>{booking.resources.length ? booking.resources.map((assignment) => assignment.resource.name).join(", ") : "None"}</td>
                </tr>
                <tr>
                  <td>Location</td>
                  <td>
                    <MapPin size={16} /> {booking.service.location || "Shared after booking"}
                  </td>
                </tr>
                <tr>
                  <td>Customer</td>
                  <td>
                    {booking.customerName}
                    <br />
                    <span className="muted-text">{booking.customerEmail}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <SelfServicePanel
            bookingId={booking.id}
            canManage={canManage}
            defaultDate={getZonedDateKey(booking.startsAt, settings.timezone)}
            token={token}
          />
        </section>

        <section className="card">
          <h2 className="section-title">Appointment history</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Service</th>
                <th>When</th>
                <th>Status</th>
                <th>Staff</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{item.service.name}</td>
                  <td>{formatDateTime(item.startsAt, settings.timezone)}</td>
                  <td>
                    <span className="pill">{statusLabel(item.status)}</span>
                  </td>
                  <td>{item.staff?.name || "Any staff"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>
    </main>
  );
}
