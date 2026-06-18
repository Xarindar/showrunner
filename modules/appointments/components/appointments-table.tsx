import type { Booking, BookingResource, Resource, Service, StaffMember } from "@prisma/client";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { updateBookingStatusAction } from "../actions";
import { Table } from "@/components/ui";

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
    <div>
      <Table>
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
                {booking.service.name}
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
                <div className="ui-zero">
                  {(["CONFIRMED", "CANCELED", "COMPLETED"] as const).map((status) =>
                <form key={status} action={updateBookingStatusAction}>
                      <input type="hidden" name="id" value={booking.id} />
                      <input type="hidden" name="status" value={status} />
                      <button className={status === "CANCELED" ? "ui-button ui-button-danger" : "ui-button ui-button-secondary"} type="submit">
                        {status.toLowerCase()}
                      </button>
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
    </div>);

}
