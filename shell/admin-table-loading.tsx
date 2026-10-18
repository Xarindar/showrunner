import { SkeletonBlock, SkeletonLine } from "@/components/ui/states";

const headings = { clients: "Clients", products: "Products", services: "Session types", packages: "Service bundles" };

export function AdminTableSkeleton({ kind }: { kind: keyof typeof headings }) {
  return (
    <section className="stack admin-loading" aria-busy="true" aria-label={`Loading ${headings[kind]}`}>
      <header className="page-header">
        <h1>{kind === "services" ? "Services" : headings[kind]}</h1>
      </header>
      <p className="ui-sr-only" role="status">Loading {headings[kind]}…</p>
      <div className="admin-loading-section" aria-hidden="true">
        <div><SkeletonLine className="admin-loading-section-title" /><SkeletonLine width="short" /></div>
        <SkeletonBlock className="admin-loading-action" />
      </div>
      <div className="admin-loading-toolbar" aria-hidden="true">
        <SkeletonBlock className="admin-loading-search" />
        <SkeletonBlock className="admin-loading-action" />
      </div>
      <div className="admin-loading-table" aria-hidden="true">
        <div className="admin-loading-columns"><SkeletonLine /><SkeletonLine /><SkeletonLine /></div>
        {Array.from({ length: 6 }, (_, index) => (
          <div className="admin-loading-table-row" key={index}>
            <div className="admin-loading-item">
              {kind === "products" || kind === "services" ? <SkeletonBlock className="admin-loading-thumbnail" /> : null}
              <SkeletonLine width={index % 2 ? "medium" : "long"} />
            </div>
            <SkeletonLine width="short" />
            <SkeletonLine width="medium" />
          </div>
        ))}
      </div>
    </section>
  );
}
