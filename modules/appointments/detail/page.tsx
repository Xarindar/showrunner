import { DateTimeInput } from "@/components/ui/time-input";
import { Notification } from "@/components/ui/notifications";

import { notFound } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { FormAttachmentTargetType } from "@prisma/client";
import { getAccessibleBookingWhere, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatTime, formatDateTime } from "@/lib/format";
import { getSiteSettings } from "@/lib/site";
import { sessionPackageSnapshotSchema } from "@/lib/scheduling/session-offering";
import { addBookingNoteAction, deleteBookingNoteAction, updateBookingDetailAction } from "../actions";
import { Button, ButtonLink, Switch, Table } from "@/components/ui";

import { NotesTable } from "@/components/ui/notes-table";
import { LocationInput } from "@/components/ui/location-input";
import { locationMapHref } from "@/lib/locations";
import { AppointmentNotes } from "./appointment-notes";
import { AppointmentContact, AppointmentEdit } from "./appointment-overview";
import { AppointmentActions } from "./appointment-actions";
import styles from "./detail.module.css";

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
      staffNotes: { orderBy: { createdAt: "desc" } },
      service: true,
      staff: true,
      client: true
    }
  });

  if (!booking) notFound();
  const packageSnapshot = sessionPackageSnapshotSchema.safeParse(booking.packageSnapshot);
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
    <div className={`stack ${styles.page}`}>
      <header className="page-header" data-admin-page-header>
        <h1 className="ui-sr-only">Appointment details</h1>
        <div className="ui-inline-actions">
          <ButtonLink href="/admin/modules/appointments" variant="ghost" size="sm"><ArrowLeft aria-hidden="true" size={15} />Bookings</ButtonLink>

        </div>
      </header>

      {saved ? <Notification tone="success" queryKey="saved">{saved === "created" ? "Session created." : saved === "reschedule-notify" || saved === "reschedule-silent" ? "Appointment rescheduled." : "Appointment updated."}</Notification> : null}
      {error ? <Notification tone="danger" queryKey="error">{error}</Notification> : null}

      <div className={styles.overview}>
        <section className="ui-data-table-shell" aria-labelledby="appointment-details-title">
          <AppointmentEdit key={booking.updatedAt.toISOString()}>
              <form action={updateBookingDetailAction} className="form-grid">
                <input type="hidden" name="id" value={booking.id} />
                <div className="ui-field"><label htmlFor="session-name">Session</label><input id="session-name" name="sessionName" defaultValue={booking.sessionName || booking.service.name} required maxLength={200} /></div>
                <div className="ui-field">
                  <label htmlFor="startsAt">Date and time</label>
                  <DateTimeInput aria-label="Appointment" id="startsAt" name="startsAt" defaultValue={formatDateTimeLocalInput(booking.startsAt, settings.timezone)} required />
                </div>
                <div className="ui-field"><label htmlFor="session-location">Location (optional)</label><LocationInput id="session-location" name="sessionLocation" defaultValue={booking.sessionLocation ?? booking.service.location ?? ""} placeholder="Search for a place or address" /></div>
                <div className="ui-field"><label htmlFor="agreed-price">Agreed price ($)</label><input id="agreed-price" name="agreedPrice" inputMode="decimal" defaultValue={booking.priceCents == null ? "" : (booking.priceCents / 100).toFixed(2)} /></div>
                <Switch label="Email customer if date or time changes" name="notifyCustomer" defaultChecked variant="inline" />
                <div className="module-modal-actions"><Button type="submit">Save changes</Button></div>
              </form>
          </AppointmentEdit>
          <Table aria-label="Appointment details" mobileLayout="columns" className={styles.facts} tableClassName="ui-data-table">
            <tbody>
              <tr><th scope="row" data-mobile-column>Client</th><td data-mobile-column><AppointmentContact name={booking.client?.name || booking.customerName}>
            <div className="ui-stack">
              <div className={styles.contactHeading}><h2>{booking.client?.name || booking.customerName}</h2>{booking.client?.companyName ? <p className="muted-text">{booking.client.companyName}</p> : null}</div>
              <Table aria-label="Client contact" mobileLayout="columns" className={styles.facts} tableClassName="ui-data-table"><tbody>
                <tr><th scope="row" data-mobile-column>Email</th><td data-mobile-column><a href={`mailto:${booking.customerEmail}`}>{booking.customerEmail}</a></td></tr>
                <tr><th scope="row" data-mobile-column>Phone</th><td data-mobile-column>{booking.customerPhone ? <a href={`tel:${booking.customerPhone.replace(/[^\d+]/g, "")}`}>{booking.customerPhone}</a> : "Not provided"}</td></tr>
                <tr><th scope="row" data-mobile-column>Address</th><td data-mobile-column>{booking.client ? [booking.client.addressLine1, booking.client.addressLine2, booking.client.city, booking.client.region, booking.client.postalCode, booking.client.country].filter(Boolean).join(", ") || "Not provided" : "Not provided"}</td></tr>
              </tbody></Table>
              {booking.client ? <ButtonLink href={`/admin/clients/${booking.client.id}`} variant="secondary">Open client profile</ButtonLink> : null}
            </div>
          </AppointmentContact></td></tr>
              <tr><th scope="row" data-mobile-column>Session</th><td data-mobile-column>{booking.sessionName || booking.service.name}</td></tr>
              <tr><th scope="row" data-mobile-column>When</th><td data-mobile-column>{formatDateTime(booking.startsAt, settings.timezone)} – {formatTime(booking.endsAt, settings.timezone)}</td></tr>
              <tr><th scope="row" data-mobile-column>Location</th><td data-mobile-column>{(booking.sessionLocation ?? booking.service.location) ? <a href={locationMapHref((booking.sessionLocation ?? booking.service.location)!)} target="_blank" rel="noreferrer">{booking.sessionLocation ?? booking.service.location} · Open map</a> : "To be arranged"}</td></tr>
              <tr><th scope="row" data-mobile-column>Agreed price</th><td data-mobile-column>{booking.priceCents == null ? "Not set" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(booking.priceCents / 100)}</td></tr>
            </tbody>
          </Table>

        </section>
        <aside className="ui-data-table-shell" aria-labelledby="appointment-actions-title">
          <div className="ui-data-table-titlebar"><h2 id="appointment-actions-title">Actions</h2></div>
          <div className="ui-section-body">
          <AppointmentActions bookingId={booking.id} cancellationReason={booking.cancellationReason} />
          </div>
        </aside>
      </div>

      <section className="ui-data-table-shell" aria-labelledby="appointment-booking-title">
        <div className="ui-data-table-titlebar"><h2 id="appointment-booking-title">Booking details</h2></div>
        <Table aria-label="Booking details" mobileLayout="columns" className={styles.facts} tableClassName="ui-data-table">
          <tbody>
            {packageSnapshot.success && <>
              <tr><th scope="row" data-mobile-column>Package</th><td data-mobile-column>{packageSnapshot.data.name}</td></tr>
              {packageSnapshot.data.hourlyRate && <tr><th scope="row" data-mobile-column>Hourly rate</th><td data-mobile-column>{packageSnapshot.data.hourlyRate.name} · ${(packageSnapshot.data.hourlyRate.amountCents / 100).toFixed(2)} / hour</td></tr>}
              <tr><th scope="row" data-mobile-column>Included coverage</th><td data-mobile-column>{packageSnapshot.data.coverage.join(" · ") || "No coverage items specified"}</td></tr>
              {packageSnapshot.data.extras.length > 0 && <tr><th scope="row" data-mobile-column>Extras</th><td data-mobile-column>{packageSnapshot.data.extras.map(item => item.name).join(" · ")}</td></tr>}
            </>}
            <tr><th scope="row" data-mobile-column>Staff</th><td data-mobile-column>{booking.staff?.name || "Any staff"}</td></tr>
            <tr><th scope="row" data-mobile-column>Resources</th><td data-mobile-column>{booking.resources.length ? booking.resources.map((assignment) => assignment.resource.name).join(", ") : "None"}</td></tr>
            {booking.notes ? <tr><th scope="row" data-mobile-column>Customer notes</th><td data-mobile-column>{booking.notes}</td></tr> : null}
            {booking.intakeResponse ? <tr><th scope="row" data-mobile-column>Intake response</th><td data-mobile-column>{booking.intakeResponse}</td></tr> : null}
            <tr><th scope="row" data-mobile-column>Policy accepted</th><td data-mobile-column>{booking.policyAccepted ? "Yes" : "No"}</td></tr>
          </tbody>
        </Table>
      </section>



      {formAttachments.length ?
      <section className="ui-data-table-shell" aria-labelledby="appointment-forms-title">
          <div className="ui-data-table-titlebar"><h2 id="appointment-forms-title">Attached forms</h2></div>
          <Table aria-label="Attached forms" tableClassName="ui-data-table">
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
                    <ButtonLink href={`/admin/modules/forms?form=${attachment.formId}`} variant="ghost" size="sm">Open form record</ButtonLink>
                  </td>
                </tr>
            )}
            </tbody>
          </Table>
        </section> :
      null}



      <AppointmentNotes key={booking.staffNotes.length} noteForm={
        <form action={addBookingNoteAction} className="form-grid">
          <input type="hidden" name="id" value={booking.id} />
          <div className="ui-field"><label htmlFor="appointment-note-content">Note (staff only)</label><textarea id="appointment-note-content" name="content" required /></div>
          <div className="module-modal-actions"><Button type="submit"><Save size={18} aria-hidden="true" />Save note</Button></div>
        </form>
      }>
        <NotesTable notes={booking.staffNotes} timezone={settings.timezone} renderActions={note => (
          <form action={deleteBookingNoteAction} className="ui-inline-actions">
            <input type="hidden" name="id" value={booking.id} />
            <input type="hidden" name="noteId" value={note.id} />
            <Switch label="Confirm" name="confirmDelete" variant="inline" />
            <Button size="sm" type="submit" variant="secondary">Delete</Button>
          </form>
        )} />
      </AppointmentNotes>

    </div>);

}
