import type { StaffMember } from "@prisma/client";

type CalendarFeedsPanelProps = {
  siteFeedUrl: string;
  staffFeedUrls: Array<{
    staff: StaffMember;
    url: string;
  }>;
};

export function CalendarFeedsPanel({ siteFeedUrl, staffFeedUrls }: CalendarFeedsPanelProps) {
  return (
    <section className="card form-grid">
      <div>
        <h2 style={{ fontSize: "1.35rem" }}>Calendar feeds</h2>
        <p style={{ color: "var(--muted)" }}>
          Token-protected read-only ICS feeds for upcoming pending and confirmed bookings.
        </p>
      </div>

      <div className="field">
        <label htmlFor="site-calendar-feed">All bookings</label>
        <input id="site-calendar-feed" readOnly value={siteFeedUrl} />
      </div>

      {staffFeedUrls.length ? (
        <table className="table">
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
                  {staff.title ? <span style={{ color: "var(--muted)" }}> {staff.title}</span> : null}
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
