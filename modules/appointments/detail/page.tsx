import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Save } from "lucide-react";
import { getAccessibleBookingWhere, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { getSiteSettings } from "@/lib/site";
import { rescheduleBookingAction, updateBookingDetailAction, updateBookingStatusAction } from "../actions";

export const dynamic = "force-dynamic";

type AppointmentDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
};

function formatDateTimeLocalInput(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export default async function AppointmentDetailPage({ params, searchParams }: AppointmentDetailPageProps) {
  const [{ id }, { saved, error }] = await Promise.all([params, searchParams]);
  const user = await requireAdmin("appointments:manage");
  const settings = await getSiteSettings();
  const booking = await prisma.booking.findFirst({
    where: await getAccessibleBookingWhere(user, settings.siteId, { id }),
    include: {
      resources: { include: { resource: true }, orderBy: { resource: { name: "asc" } } },
      service: true,
      staff: true,
      client: true
    }
  });

  if (!booking) notFound();

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Appointment</p>
          <h1 style={{ fontSize: "2.4rem" }}>{booking.customerName}</h1>
          <p>
            {booking.service.name} - {formatDateTime(booking.startsAt, settings.timezone)}
          </p>
        </div>
        <Link className="button secondary" href="/admin/modules/appointments">
          Back to appointments
        </Link>
      </header>

      {saved ? <div className="success-message">Appointment updated.</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <section className="grid-2">
        <div className="card">
          <h2 style={{ fontSize: "1.35rem" }}>Appointment details</h2>
          <table className="table">
            <tbody>
              <tr>
                <td>Status</td>
                <td>
                  <span className="pill">{booking.status.toLowerCase()}</span>
                </td>
              </tr>
              <tr>
                <td>Customer</td>
                <td>
                  {booking.client ? (
                    <Link href={`/admin/clients/${booking.client.id}`}>{booking.client.name}</Link>
                  ) : (
                    booking.customerName
                  )}
                  <br />
                  <span style={{ color: "var(--muted)" }}>{booking.customerEmail}</span>
                </td>
              </tr>
              <tr>
                <td>Phone</td>
                <td>{booking.customerPhone || "Not provided"}</td>
              </tr>
              <tr>
                <td>Service</td>
                <td>{booking.service.name}</td>
              </tr>
              <tr>
                <td>Staff</td>
                <td>{booking.staff?.name || "Any staff"}</td>
              </tr>
              <tr>
                <td>Resources</td>
                <td>{booking.resources.length ? booking.resources.map((assignment) => assignment.resource.name).join(", ") : "None"}</td>
              </tr>
              <tr>
                <td>Time</td>
                <td>
                  {formatDateTime(booking.startsAt, settings.timezone)} -{" "}
                  {new Intl.DateTimeFormat("en", { timeStyle: "short", timeZone: settings.timezone }).format(booking.endsAt)}
                </td>
              </tr>
              <tr>
                <td>Customer notes</td>
                <td>{booking.notes || "None"}</td>
              </tr>
              <tr>
                <td>Intake response</td>
                <td>{booking.intakeResponse || "None"}</td>
              </tr>
              <tr>
                <td>Policy accepted</td>
                <td>{booking.policyAccepted ? "Yes" : "No"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card form-grid">
          <h2 style={{ fontSize: "1.35rem" }}>Status actions</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(["CONFIRMED", "CANCELED", "COMPLETED"] as const).map((status) => (
              <form key={status} action={updateBookingStatusAction}>
                <input type="hidden" name="id" value={booking.id} />
                <input type="hidden" name="status" value={status} />
                <button className={status === "CANCELED" ? "button danger" : "button secondary"} type="submit">
                  {status.toLowerCase()}
                </button>
              </form>
            ))}
          </div>
        </div>
      </section>

      <form action={rescheduleBookingAction} className="card form-grid">
        <input type="hidden" name="id" value={booking.id} />
        <h2 style={{ fontSize: "1.35rem" }}>Reschedule</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="startsAt">New start time</label>
            <input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              defaultValue={formatDateTimeLocalInput(booking.startsAt, settings.timezone)}
              required
            />
          </div>
          <div className="field">
            <label>Validation</label>
            <span className="pill">availability, buffers, blockouts, conflicts</span>
          </div>
        </div>
        <button className="button secondary" type="submit">
          <CalendarClock size={18} />
          Reschedule appointment
        </button>
      </form>

      <form action={updateBookingDetailAction} className="card form-grid">
        <input type="hidden" name="id" value={booking.id} />
        <h2 style={{ fontSize: "1.35rem" }}>Internal appointment notes</h2>
        <div className="field">
          <label htmlFor="adminNotes">Admin notes</label>
          <textarea id="adminNotes" name="adminNotes" defaultValue={booking.adminNotes || ""} />
        </div>
        <div className="field">
          <label htmlFor="cancellationReason">Cancellation reason</label>
          <input id="cancellationReason" name="cancellationReason" defaultValue={booking.cancellationReason || ""} />
        </div>
        <button className="button" type="submit">
          <Save size={18} />
          Save appointment notes
        </button>
      </form>
    </div>
  );
}
