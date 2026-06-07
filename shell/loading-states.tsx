type AdminSkeletonProps = {
  rows?: number;
};

export function AdminSkeleton({ rows = 6 }: AdminSkeletonProps) {
  return (
    <div className="skeleton-screen" aria-busy="true" aria-label="Loading">
      <div className="skeleton-header">
        <span className="skeleton-line short" />
        <span className="skeleton-block" />
        <span className="skeleton-line medium" />
      </div>

      <div className="skeleton-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="skeleton-card" key={index}>
            <span className="skeleton-line short" />
            <span className="skeleton-block" />
            <span className="skeleton-line medium" />
          </div>
        ))}
      </div>

      <div className="skeleton-panel">
        <span className="skeleton-line short" />
        <div className="skeleton-stack">
          {Array.from({ length: rows }, (_, index) => (
            <div className="skeleton-row" key={index}>
              <span className="skeleton-dot" />
              <span className="skeleton-line long" />
              <span className="skeleton-line medium" />
            </div>
          ))}
        </div>
      </div>
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
