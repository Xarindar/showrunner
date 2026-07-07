import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, ChevronDown, Save } from "lucide-react";
import { FormAttachmentTargetType } from "@prisma/client";
import { getAccessibleBookingWhere, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { getSiteSettings } from "@/lib/site";
import { rescheduleBookingAction, updateBookingDetailAction, updateBookingStatusAction } from "../actions";
import { Button, ButtonLink, Card, Table } from "@/components/ui";

export const dynamic = "force-dynamic";

type AppointmentDetailPageProps = {
  params: Promise<{id: string;}>;
  searchParams: Promise<{saved?: string;error?: string;}>;
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
  const formAttachments = await prisma.formAttachment.findMany({
    where: {
      siteId: settings.siteId,
      targetId: booking.id,
      targetType: FormAttachmentTargetType.BOOKING
    },
    include: {
      _count: { select: { submissions: true } },
      form: { select: { name: true, slug: true, status: true } }
    },
    orderBy: [{ isRequired: "desc" }, { createdAt: "asc" }]
  });

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Appointment</p>
          <h1>{booking.customerName}</h1>
          <p>
            {booking.service.name} - {formatDateTime(booking.startsAt, settings.timezone)}
          </p>
        </div>
        <ButtonLink href="/admin/modules/appointments" variant="secondary">
          Back to appointments
        </ButtonLink>
      </header>

      {saved ? <div className="success-message">Appointment updated.</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <section aria-label="Status actions" className="appointment-detail-toolbar">
        <span className="ui-badge">{booking.status.toLowerCase()}</span>
        {(["CONFIRMED", "CANCELED", "COMPLETED"] as const).map((status) =>
        <form key={status} action={updateBookingStatusAction}>
            <input type="hidden" name="id" value={booking.id} />
            <input type="hidden" name="status" value={status} />
            <Button size="sm" type="submit" variant={status === "CANCELED" ? "danger" : "secondary"}>
              {status === "CONFIRMED" ? "Confirm" : status === "CANCELED" ? "Cancel" : "Complete"}
            </Button>
          </form>
        )}
      </section>

      <Card as="section" minHeight="none">
        <h2 className="section-title">Appointment details</h2>
          <Table>
            <tbody>
              <tr>
                <td>Status</td>
                <td>
                  <span className="ui-badge">{booking.status.toLowerCase()}</span>
                </td>
              </tr>
              <tr>
                <td>Customer</td>
                <td>
                  {booking.client ?
                  <Link href={`/admin/clients/${booking.client.id}`}>{booking.client.name}</Link> :

                  booking.customerName
                  }
                  <br />
                  <span className="muted-text">{booking.customerEmail}</span>
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
          </Table>
      </Card>

      {formAttachments.length ?
      <Card as="section" bodyClassName="ui-stack">
          <h2 className="section-title">Attached forms</h2>
          <Table>
            <thead>
              <tr>
                <th>Form</th>
                <th>Rule</th>
                <th>Submissions</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {formAttachments.map((attachment) =>
            <tr key={attachment.id}>
                  <td>
                    <strong>{attachment.form.name}</strong>
                    <br />
                    <span className="muted-text">{attachment.form.status.toLowerCase()}</span>
                  </td>
                  <td>
                    <span className={attachment.isRequired ? "ui-badge ui-badge-success" : "ui-badge"}>{attachment.isRequired ? "required" : "optional"}</span>
                  </td>
                  <td>{attachment._count.submissions}</td>
                  <td>
                    <Link href={`/admin/modules/forms?form=${attachment.formId}`}>Open form record</Link>
                  </td>
                </tr>
            )}
            </tbody>
          </Table>
        </Card> :
      null}

      <details className="ui-disclosure">
        <summary>
          <span>Reschedule</span>
          <small>Checked against availability, buffers, blockouts, and conflicts</small>
          <ChevronDown aria-hidden="true" className="ui-disclosure-caret" size={16} />
        </summary>
        <form action={rescheduleBookingAction} className="form-grid">
          <input type="hidden" name="id" value={booking.id} />
          <div className="ui-field">
            <label htmlFor="startsAt">New start time</label>
            <input
              id="startsAt"
              name="startsAt"
              type="datetime-local"
              defaultValue={formatDateTimeLocalInput(booking.startsAt, settings.timezone)}
              required />

          </div>
          <div>
            <Button type="submit" variant="secondary">
              <CalendarClock size={18} />
              Reschedule appointment
            </Button>
          </div>
        </form>
      </details>

      <details className="ui-disclosure" open={Boolean(booking.adminNotes || booking.cancellationReason)}>
        <summary>
          <span>Internal notes</span>
          <small>{booking.adminNotes ? "Notes saved" : "No notes yet"}</small>
          <ChevronDown aria-hidden="true" className="ui-disclosure-caret" size={16} />
        </summary>
        <form action={updateBookingDetailAction} className="form-grid">
          <input type="hidden" name="id" value={booking.id} />
          <div className="ui-field">
            <label htmlFor="adminNotes">Admin notes</label>
            <textarea id="adminNotes" name="adminNotes" defaultValue={booking.adminNotes || ""} />
          </div>
          <div className="ui-field">
            <label htmlFor="cancellationReason">Cancellation reason</label>
            <input id="cancellationReason" name="cancellationReason" defaultValue={booking.cancellationReason || ""} />
          </div>
          <div>
            <Button type="submit">
              <Save size={18} />
              Save appointment notes
            </Button>
          </div>
        </form>
      </details>
    </div>);

}
