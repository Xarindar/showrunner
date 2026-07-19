import { Card, EqualGrid, SkeletonBlock, SkeletonLine } from "@/components/ui";

type AdminSkeletonProps = {
  rows?: number;
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

export function AdminSkeleton({ rows = 6 }: AdminSkeletonProps) {
  return (
    <div className="skeleton-screen" aria-busy="true" aria-label="Loading">
      <div className="skeleton-header">
        <SkeletonLine width="short" />
        <SkeletonBlock />
        <SkeletonLine width="medium" />
      </div>

      <EqualGrid className="skeleton-grid" min="180px">
        {Array.from({ length: 4 }, (_, index) => (
          <Card className="skeleton-card" key={index} minHeight="sm">
            <SkeletonLine width="short" />
            <SkeletonBlock />
            <SkeletonLine width="medium" />
          </Card>
        ))}
      </EqualGrid>

      <Card className="skeleton-panel" minHeight="lg" reservedHeader={<SkeletonLine width="short" />}>
        <div className="skeleton-stack">
          {Array.from({ length: rows }, (_, index) => (
            <div className="skeleton-row" key={index}>
              <span className="skeleton-dot" />
              <SkeletonLine width="long" />
              <SkeletonLine width="medium" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function AppointmentsSkeleton() {
  return (
    <div className="appointments-workspace appointments-skeleton" aria-busy="true" aria-label="Loading appointment calendar">
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

export function BookingSkeleton() {
  return (
    <main className="site-shell">
      <section className="booking-page">
        <div className="booking-intro skeleton-header" aria-busy="true" aria-label="Loading booking page">
          <span className="skeleton-line short" />
          <span className="skeleton-block" />
          <span className="skeleton-line medium" />
        </div>
        <div className="booking-main">
          <div className="booking-progress">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="booking-progress-step active" key={index}>
                <span>{index + 1}</span>
                <span className="skeleton-line short" />
              </div>
            ))}
          </div>
          <div className="booking-card">
            <div className="skeleton-stack">
              {Array.from({ length: 6 }, (_, index) => (
                <div className="skeleton-row" key={index}>
                  <span className="skeleton-dot" />
                  <span className="skeleton-line long" />
                  <span className="skeleton-line medium" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export function PublicSkeleton() {
  return (
    <main className="site-shell" aria-busy="true" aria-label="Loading">
      <nav className="site-nav">
        <div className="brand">
          <span className="brand-mark" />
          <span className="skeleton-line medium" />
        </div>
        <div className="site-nav-links">
          <span className="skeleton-block" />
          <span className="skeleton-block" />
        </div>
      </nav>
      <section className="section">
        <div className="skeleton-header">
          <span className="skeleton-line short" />
          <span className="skeleton-block" />
          <span className="skeleton-line long" />
        </div>
        <div className="skeleton-panel">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="skeleton-row" key={index}>
              <span className="skeleton-dot" />
              <span className="skeleton-line long" />
              <span className="skeleton-line medium" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
