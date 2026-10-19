import { SkeletonBlock, SkeletonLine } from "@/components/ui/states";

type AdminSkeletonProps = {
  rows?: number;
  title?: string;
  kind?: "workspace" | "editor" | "website" | "gallery";
};

const appointmentSkeletonEvents = ([
  { column: 2, row: 2, span: 2 },
  { column: 3, row: 2, span: 3 },
  { column: 4, row: 2, span: 2 },
  { column: 5, row: 2, span: 3 },
  { column: 7, row: 3, span: 2 },
  { column: 2, row: 5, span: 2 },
  { column: 3, row: 5, span: 3 },
  { column: 4, row: 5, span: 2 },
  { column: 5, row: 5, span: 3 },
  { column: 6, row: 5, span: 3 },
  { column: 7, row: 6, span: 2 },
  { column: 3, row: 9, span: 2 },
  { column: 4, row: 9, span: 3 },
  { column: 5, row: 9, span: 2 },
  { column: 6, row: 9, span: 2 }
] as const).map(({ column, row, span }) => ({
  key: `${column}-${row}`,
  style: { gridColumn: column, gridRow: `${row} / span ${span}` }
}));

export function AdminSkeleton({ rows = 5, title = "", kind = "workspace" }: AdminSkeletonProps) {
  return (
    <section className={`stack admin-loading admin-loading-${kind}`} aria-busy="true" aria-label={title ? `Loading ${title}` : "Loading page"}>
      <header className="page-header">
        {title ? <h1>{title}</h1> : <SkeletonLine className="admin-loading-heading" aria-hidden="true" />}
        <SkeletonBlock className="admin-loading-action" aria-hidden="true" />
      </header>
      <p className="ui-sr-only" role="status">{title ? `Loading ${title}…` : "Loading page…"}</p>
      {kind === "gallery" ? (
        <div className="admin-loading-toolbar" aria-hidden="true">
          <SkeletonBlock className="admin-loading-search" />
          <SkeletonBlock className="admin-loading-action" />
          <SkeletonBlock className="admin-loading-action" />
        </div>
      ) : (
        <div className="admin-loading-body" aria-hidden="true">
          <div className="admin-loading-fields">
            {kind === "website" ? <SkeletonBlock className="admin-loading-preview" /> : Array.from({ length: rows }, (_, index) => (
              <div className="admin-loading-field" key={index}>
                <SkeletonLine width="short" />
                <SkeletonBlock />
              </div>
            ))}
          </div>
          {kind === "editor" ? <aside className="admin-loading-settings">
            <SkeletonLine width="medium" />
            <SkeletonBlock />
            <SkeletonLine width="short" />
            <SkeletonBlock />
          </aside> : null}
        </div>
      )}
    </section>
  );
}

export function AppointmentsSkeleton() {
  return (
    <div className="appointments-workspace appointments-skeleton" aria-busy="true" aria-label="Loading appointment calendar">
      <p className="ui-sr-only" role="status">Loading appointments…</p>
      <section className="appointments-calendar-shell">
        <header className="appointments-subtle-header appointments-skeleton-header" aria-hidden="true">
          <div className="appointments-subtle-title appointments-skeleton-title">
            <SkeletonLine className="appointments-skeleton-eyebrow" />
            <SkeletonLine className="appointments-skeleton-range" />
            <SkeletonLine className="appointments-skeleton-count" />
          </div>

          <div className="appointments-header-nav appointments-skeleton-header-nav">
            <SkeletonBlock className="appointments-skeleton-control compact" />
            <SkeletonBlock className="appointments-skeleton-control today" />
            <SkeletonBlock className="appointments-skeleton-control compact" />
          </div>

          <div className="appointments-header-actions appointments-skeleton-header-actions">
            {Array.from({ length: 4 }, (_, index) => (
              <SkeletonBlock className="appointments-skeleton-control action" key={index} />
            ))}
            <SkeletonBlock className="appointments-skeleton-control compact" />
          </div>
        </header>

        <div className="appointments-calendar-canvas" aria-hidden="true">
          <div className="appointment-calendar">
            <div className="appointment-calendar-client-bar appointments-skeleton-client-bar">
              <div className="appointments-skeleton-tabs">
                {Array.from({ length: 4 }, (_, index) => (
                  <SkeletonBlock className="appointments-skeleton-tab" key={index} />
                ))}
              </div>
              <SkeletonLine className="appointments-skeleton-summary" />
            </div>

            <div className="appointment-fullcalendar appointments-skeleton-calendar">
              <div className="appointments-skeleton-day-row">
                <span className="appointments-skeleton-axis" />
                {Array.from({ length: 7 }, (_, index) => (
                  <span className="appointments-skeleton-day" key={index}>
                    <SkeletonLine />
                  </span>
                ))}
              </div>

              <div className="appointments-skeleton-time-grid">
                <div className="appointments-skeleton-times">
                  {Array.from({ length: 10 }, (_, index) => (
                    <SkeletonLine key={index} />
                  ))}
                </div>
                {Array.from({ length: 7 }, (_, index) => (
                  <span className="appointments-skeleton-column" key={index} />
                ))}
                <div className="appointments-skeleton-events">
                  {appointmentSkeletonEvents.map((event, index) => (
                    <span
                      className="appointments-skeleton-event"
                      key={event.key}
                      style={event.style}
                    >
                      <SkeletonLine width={index % 3 === 0 ? "medium" : "long"} />
                      <SkeletonLine width="medium" />
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
