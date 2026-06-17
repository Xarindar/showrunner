import { CalendarClock } from "lucide-react";
import { SchedulingCalendarConnectionStatus, SchedulingCalendarOwnerType, type SchedulingCalendarConnection, type StaffMember } from "@prisma/client";
import { googleCalendarConnectPath, googleCalendarConnectionLabel } from "@/lib/scheduling/google-calendar";

type CalendarFeedsPanelProps = {
  googleConnections: Array<{
    connection: SchedulingCalendarConnection;
    staff: StaffMember | null;
  }>;
  siteFeedUrl: string;
  staff: StaffMember[];
  staffFeedUrls: Array<{
    staff: StaffMember;
    url: string;
  }>;
};

function connectionFor(
  connections: CalendarFeedsPanelProps["googleConnections"],
  ownerType: SchedulingCalendarOwnerType,
  ownerId = ""
) {
  return connections.find((item) => item.connection.ownerType === ownerType && item.connection.ownerId === ownerId);
}

function connectionStatus(connection?: SchedulingCalendarConnection) {
  if (!connection) return <span className="ui-badge ui-badge-warning">Not connected</span>;
  if (connection.status === SchedulingCalendarConnectionStatus.CONNECTED) return <span className="ui-badge ui-badge-success">Connected</span>;
  return <span className="ui-badge ui-badge-danger">Needs attention</span>;
}

function connectionDetail(item?: CalendarFeedsPanelProps["googleConnections"][number]) {
  if (!item) return "Connect Google Calendar to subtract busy time from public availability.";

  const verified = item.connection.lastVerifiedAt ? `Checked ${item.connection.lastVerifiedAt.toLocaleString()}.` : "";
  const error = item.connection.lastError ? ` ${item.connection.lastError}` : "";
  return `${googleCalendarConnectionLabel({ ...item.connection, staff: item.staff })}. ${verified}${error}`;
}

export function CalendarFeedsPanel({ googleConnections, siteFeedUrl, staff, staffFeedUrls }: CalendarFeedsPanelProps) {
  const siteGoogleConnection = connectionFor(googleConnections, SchedulingCalendarOwnerType.SITE);

  return (
    <section className="ui-card ui-card-density-normal ui-card-min-none form-grid">
      <div>
        <h2 className="section-title">Calendars</h2>
        <p className="ui-zero">
          Subscribe to bookings with ICS feeds and connect Google Calendar to remove busy time from public availability.
        </p>
      </div>

      <div className="subpanel form-grid">
        <div className="grid-2">
          <div>
            <h3>Google free/busy</h3>
            <p className="ui-zero">
              Connected calendars are read for busy blocks only; Showrunner does not write events to Google Calendar.
            </p>
          </div>
          <div className="ui-zero">
            {connectionStatus(siteGoogleConnection?.connection)}
            <a className="ui-button ui-button-secondary" href={googleCalendarConnectPath({ ownerType: SchedulingCalendarOwnerType.SITE })}>
              <CalendarClock size={18} />
              {siteGoogleConnection ? "Reconnect business calendar" : "Connect business calendar"}
            </a>
          </div>
        </div>
        <p className="ui-zero">{connectionDetail(siteGoogleConnection)}</p>

        {staff.length ? (
          <table className="ui-table">
            <thead>
              <tr>
                <th>Staff</th>
                <th>Status</th>
                <th>Google Calendar</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((member) => {
                const item = connectionFor(googleConnections, SchedulingCalendarOwnerType.STAFF, member.id);
                return (
                  <tr key={member.id}>
                    <td>
                      <strong>{member.name}</strong>
                      {member.title ? <span className="muted-text"> {member.title}</span> : null}
                    </td>
                    <td>{connectionStatus(item?.connection)}</td>
                    <td>
                      <a className="ui-button ui-button-secondary" href={googleCalendarConnectPath({ ownerId: member.id, ownerType: SchedulingCalendarOwnerType.STAFF })}>
                        <CalendarClock size={18} />
                        {item ? "Reconnect" : "Connect"}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>

      <div>
        <h3>ICS feeds</h3>
        <p className="ui-zero">Token-protected read-only feeds for upcoming pending and confirmed bookings.</p>
      </div>

      <div className="ui-field">
        <label htmlFor="site-calendar-feed">All bookings</label>
        <input id="site-calendar-feed" readOnly value={siteFeedUrl} />
      </div>

      {staffFeedUrls.length ? (
        <table className="ui-table">
          <thead>
            <tr>
              <th>Staff</th>
              <th>Feed</th>
            </tr>
          </thead>
          <tbody>
            {staffFeedUrls.map(({ staff, url }) => (
              <tr key={staff.id}>
                <td>
                  <strong>{staff.name}</strong>
                  {staff.title ? <span className="muted-text"> {staff.title}</span> : null}
                </td>
                <td>
                  <input aria-label={`${staff.name} calendar feed`} readOnly value={url} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty-state">Add staff to create staff-specific calendar feeds.</p>
      )}
    </section>
  );
}
