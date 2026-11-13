import type { Booking, BookingResource, Resource, Service, StaffMember } from "@prisma/client";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { updateBookingStatusAction } from "../actions";
import { Button, Table } from "@/components/ui";

type BookingWithService = Booking & {
  resources: Array<BookingResource & {resource: Resource;}>;
  service: Service;
  staff: StaffMember | null;
};

type AppointmentsTableProps = {
  bookings: BookingWithService[];
  timezone: string;
};

export function AppointmentsTable({ bookings, timezone }: AppointmentsTableProps) {
  return (
    <section className="ui-data-table-shell">
      <div className="ui-data-table-titlebar"><h2>Appointments</h2></div>
      <Table aria-label="Appointments" tableClassName="ui-data-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Service</th>
            <th>Time</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((booking) =>
          <tr key={booking.id}>
              <td>
                <Link href={`/admin/appointments/${booking.id}`}>
                  <strong>{booking.customerName}</strong>
                </Link>
                <br />
                <span className="muted-text">{booking.customerEmail}</span>
              </td>
              <td>
                {booking.sessionName || booking.service.name}
                <br />
                <span className="muted-text">{booking.staff?.name || "Any staff"}</span>
                {booking.resources.length ?
              <>
                    <br />
                    <span className="muted-text">{booking.resources.map((assignment) => assignment.resource.name).join(", ")}</span>
                  </> :
              null}
              </td>
              <td>{formatDateTime(booking.startsAt, timezone)}</td>
              <td>
                <span className="ui-badge">{booking.status.toLowerCase()}</span>
              </td>
              <td>
                <div className="ui-inline-actions">
                  {(["CONFIRMED", "CANCELED", "COMPLETED"] as const).map((status) =>
                <form key={status} action={updateBookingStatusAction}>
                      <input type="hidden" name="id" value={booking.id} />
                      <input type="hidden" name="status" value={status} />
                      <Button size="sm" variant={status === "CANCELED" ? "danger" : "secondary"} type="submit">
                        {status.toLowerCase()}
                      </Button>
                    </form>
                )}
                </div>
              </td>
            </tr>
          )}
          {!bookings.length ?
          <tr>
              <td colSpan={5}>No appointments yet.</td>
            </tr> :
          null}
        </tbody>
      </Table>
    </section>);

}
