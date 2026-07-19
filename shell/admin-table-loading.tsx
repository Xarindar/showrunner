import { SkeletonBlock, SkeletonLine } from "@/components/ui";

type AdminTableSkeletonKind = "clients" | "products" | "services";

type AdminTableSkeletonProps = {
  kind: AdminTableSkeletonKind;
};

const catalogColumns = ["item", "status", "type", "inventory", "category", "build", "value", "actions"] as const;
const clientColumns = ["client", "email", "phone", "appointments", "orders", "date", "status", "actions"] as const;
const skeletonRows = ["one", "two", "three", "four", "five", "six", "seven"] as const;

function PageHeadingSkeleton() {
  return (
    <header className="page-header" aria-hidden="true">
      <div>
        <SkeletonLine className="module-skeleton-page-heading" />
      </div>
    </header>
  );
}

function PaginationSkeleton() {
  return (
    <div className="ui-pagination module-skeleton-pagination">
      <SkeletonBlock className="module-skeleton-pagination-action" />
      <SkeletonBlock className="module-skeleton-pagination-page" />
      <SkeletonBlock className="module-skeleton-pagination-action" />
    </div>
  );
}

function ClientsSkeleton() {
  return (
    <div className="stack clients-module module-table-skeleton" aria-busy="true" aria-label="Loading clients">
      <PageHeadingSkeleton />

      <section className="ui-data-table-shell clients-data-table module-clients-skeleton" aria-hidden="true">
        <div className="ui-data-table-header">
          <div className="ui-data-table-titlebar">
            <div className="module-skeleton-heading-copy">
              <SkeletonLine className="module-skeleton-section-heading" />
              <SkeletonLine className="module-skeleton-subheading" />
            </div>
            <div className="module-skeleton-actions">
              <SkeletonBlock className="module-skeleton-action primary" />
              <SkeletonBlock className="module-skeleton-action" />
              <SkeletonBlock className="module-skeleton-action short" />
            </div>
          </div>

          <div className="ui-data-table-toolbar">
            <div className="clients-search-form ui-data-table-search module-skeleton-client-filters">
              <SkeletonBlock className="module-skeleton-search" />
              <SkeletonBlock className="module-skeleton-select" />
              <SkeletonBlock className="module-skeleton-search-button" />
            </div>
          </div>
        </div>

        <div className="ui-data-table-scroll clients-table-wrap">
          <table className="ui-data-table clients-table module-skeleton-table">
            <colgroup>
              <col className="clients-col-client" />
              <col className="clients-col-email" />
              <col className="clients-col-phone" />
              <col className="clients-col-metric" />
              <col className="clients-col-metric" />
              <col className="clients-col-date" />
              <col className="clients-col-status" />
              <col className="clients-col-actions" />
            </colgroup>
            <thead>
              <tr>
                {clientColumns.map((column) => (
                  <th key={column}>
                    <SkeletonLine />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {skeletonRows.map((row) => (
                <tr key={row}>
                  <td>
                    <span className="module-skeleton-primary-cell">
                      <SkeletonLine width="medium" />
                      <SkeletonLine width="long" />
                    </span>
                  </td>
                  <td><SkeletonLine width="long" /></td>
                  <td><SkeletonLine width="medium" /></td>
                  <td><SkeletonLine width="short" /></td>
                  <td><SkeletonLine width="short" /></td>
                  <td><SkeletonLine width="long" /></td>
                  <td><SkeletonBlock className="module-skeleton-status" /></td>
                  <td>
                    <span className="module-skeleton-row-actions">
                      <SkeletonBlock />
                      <SkeletonBlock />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="clients-mobile-list module-skeleton-mobile-list">
          {skeletonRows.slice(0, 4).map((row) => (
            <article className="clients-mobile-card module-skeleton-mobile-card" key={row}>
              <div className="clients-mobile-card-head">
                <span className="module-skeleton-primary-cell">
                  <SkeletonLine width="medium" />
                  <SkeletonLine width="long" />
                </span>
                <SkeletonBlock className="module-skeleton-status" />
              </div>
              <div className="clients-mobile-contact-grid">
                <SkeletonBlock />
                <SkeletonBlock />
              </div>
              <SkeletonBlock className="module-skeleton-mobile-summary" />
            </article>
          ))}
        </div>

        <div className="ui-data-table-footer">
          <PaginationSkeleton />
        </div>

        <div className="ui-data-table-stats module-skeleton-stats">
          {skeletonRows.slice(0, 5).map((row) => (
            <SkeletonBlock className="module-skeleton-stat-pill" key={row} />
          ))}
        </div>
      </section>
    </div>
  );
}

function CatalogTableSkeleton({ kind }: { kind: "products" | "services" }) {
  const rowCount = kind === "services" ? 5 : 3;

  return (
    <div className="service-catalog-folder-panel">
      <div className="catalog-board-header">
        <div className="module-skeleton-heading-copy">
          <SkeletonLine className="module-skeleton-kicker" />
          <SkeletonLine className="module-skeleton-section-heading" />
          <SkeletonLine className="module-skeleton-subheading" />
        </div>
        <div className="catalog-board-actions module-skeleton-actions">
          <SkeletonBlock className="module-skeleton-catalog-pill" />
          <SkeletonBlock className="module-skeleton-action primary wide" />
        </div>
      </div>

      <div className="ui-table-filter-bar catalog-board-filters module-skeleton-catalog-filters">
        <div className="ui-table-filter-search module-skeleton-catalog-filter-row">
          <SkeletonBlock className="module-skeleton-catalog-search" />
          <SkeletonBlock className="module-skeleton-catalog-select" />
          <SkeletonBlock className="module-skeleton-catalog-select" />
        </div>
      </div>

      <div className="catalog-table-scroll catalog-viewport-table">
        <table className="catalog-product-table module-skeleton-catalog-table">
          <thead>
            <tr>
              {catalogColumns.map((column) => (
                <th key={column}>
                  <SkeletonLine />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {skeletonRows.slice(0, rowCount).map((row, rowIndex) => (
              <tr key={row}>
                <td>
                  <div className="catalog-product-cell">
                    <SkeletonBlock className="catalog-row-thumb module-skeleton-thumb" />
                    <span className="catalog-row-copy module-skeleton-primary-cell">
                      <SkeletonLine width={rowIndex % 2 === 0 ? "medium" : "long"} />
                      <SkeletonLine width="long" />
                    </span>
                  </div>
                </td>
                <td><SkeletonBlock className="module-skeleton-status" /></td>
                <td><SkeletonLine width="medium" /></td>
                <td><SkeletonLine width="long" /></td>
                <td><SkeletonLine width="medium" /></td>
                <td><SkeletonLine width="long" /></td>
                <td><SkeletonLine width="medium" /></td>
                <td>
                  <span className="module-skeleton-row-actions">
                    <SkeletonBlock />
                    <SkeletonBlock />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaginationSkeleton />
    </div>
  );
}

function CatalogSkeleton({ kind }: { kind: "products" | "services" }) {
  const catalog = <CatalogTableSkeleton kind={kind} />;

  return (
    <div className={`stack products-workspace module-table-skeleton ${kind === "services" ? "service-workspace" : ""}`} aria-busy="true" aria-label={`Loading ${kind}`}>
      <PageHeadingSkeleton />

      {kind === "services" ? (
        <section className="ui-folder-tabs" aria-hidden="true">
          <div className="ui-folder-tablist">
            {skeletonRows.slice(0, 3).map((row, index) => (
              <span className={`ui-folder-tab ${index === 0 ? "is-active" : ""}`} key={row}>
                <SkeletonLine />
              </span>
            ))}
          </div>
          <div className="ui-folder-panel">{catalog}</div>
          <div className="ui-folder-tab-footer">
            <div className="catalog-table-status-strip">
              <SkeletonBlock className="module-skeleton-stat-pill" />
              <SkeletonBlock className="module-skeleton-stat-pill short" />
            </div>
          </div>
        </section>
      ) : (
        <main className="catalog-board" aria-hidden="true">{catalog}</main>
      )}
    </div>
  );
}

export function AdminTableSkeleton({ kind }: AdminTableSkeletonProps) {
  if (kind === "clients") return <ClientsSkeleton />;
  return <CatalogSkeleton kind={kind} />;
}
