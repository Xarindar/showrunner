import Link from "next/link";
import { getPlatformStatus, platformFoundationItems, type PlatformWarningSeverity } from "@/lib/platform-status";
import { getSiteSettings } from "@/lib/site";
import { moduleIcons } from "@/shell/modules";

export const dynamic = "force-dynamic";

function warningPillClassName(severity: PlatformWarningSeverity) {
  if (severity === "critical") return "pill danger";
  if (severity === "warning") return "pill warning";
  return "pill";
}

const commonWorkflows = [
  {
    label: "Add or edit bookable time",
    href: "/admin/modules/scheduling",
    detail: "Update services, availability, or blockouts."
  },
  {
    label: "Manage a new booking",
    href: "/admin/modules/appointments",
    detail: "Open the customer, then confirm, cancel, complete, or add internal notes."
  },
  {
    label: "Review a returning client",
    href: "/admin/modules/clients",
    detail: "Open the client record, then review notes and appointment history."
  },
  {
    label: "Change homepage copy",
    href: "/admin/modules/content",
    detail: "Edit homepage text and hero image fields, then check the public homepage."
  },
  {
    label: "Create a client gallery",
    href: "/admin/modules/portfolio",
    detail: "Create and publish the gallery, add media-backed items, issue access links, then open the public gallery or token route."
  },
  {
    label: "Review conversion activity",
    href: "/admin/modules/analytics",
    detail: "Review automatic and manual events, attribution, goals, CSV export, adapter IDs, and retention policy."
  }
];

export default async function HelpPage() {
  const settings = await getSiteSettings();
  const platformStatus = await getPlatformStatus(settings);
  const warningPriority = { critical: 0, warning: 1, info: 2 } satisfies Record<PlatformWarningSeverity, number>;
  const warnings = [...platformStatus.warnings].sort((left, right) => warningPriority[left.severity] - warningPriority[right.severity]);
  const enabledModules = platformStatus.modules.filter((item) => item.enabled);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Help</p>
          <h1 style={{ fontSize: "2.4rem" }}>Admin user guide</h1>
          <p>Operating notes, setup status, and readiness context for the modules currently enabled in this admin.</p>
        </div>
        <Link className="button secondary" href="/admin/modules/settings">
          Settings
        </Link>
      </header>

      <section className="dashboard-stat-grid" aria-label="Help readiness snapshot">
        <Link className="dashboard-stat" href="/admin/modules/settings">
          <span>Enabled</span>
          <strong>{platformStatus.enabledCount}</strong>
          <small>modules in the shell</small>
        </Link>
        <Link className="dashboard-stat" href="/admin/modules/help">
          <span>Runtime</span>
          <strong>{platformStatus.liveCount}</strong>
          <small>live or mixed modules</small>
        </Link>
        <Link className="dashboard-stat" href="/admin/modules/help">
          <span>Manual</span>
          <strong>{platformStatus.manualCount}</strong>
          <small>manual-mode modules</small>
        </Link>
        <Link className="dashboard-stat" href="/admin/modules/help">
          <span>Warnings</span>
          <strong>{warnings.length}</strong>
          <small>setup and operations notes</small>
        </Link>
      </section>

      <section className="card">
        <div className="page-header">
          <div>
            <h2 style={{ fontSize: "1.35rem" }}>Current setup notes</h2>
            <p>Warnings combine manifest readiness with live configuration and data checks.</p>
          </div>
        </div>
        {warnings.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Area</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {warnings.map((item) => (
                <tr key={`${item.moduleId || "platform"}-${item.title}`}>
                  <td>
                    <span className={warningPillClassName(item.severity)}>{item.severity}</span>
                  </td>
                  <td>{item.title}</td>
                  <td>{item.href ? <Link href={item.href}>{item.detail}</Link> : item.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty-state">No setup warnings are active.</p>
        )}
      </section>

      <section className="stack" aria-label="Enabled module guide">
        <div className="page-header">
          <div>
            <h2 style={{ fontSize: "1.5rem" }}>Enabled modules</h2>
            <p>Live, manual, and admin-foundation status for the modules visible in the sidebar.</p>
          </div>
        </div>

        <div className="module-readiness-grid">
          {enabledModules.map((item) => {
            const Icon = moduleIcons[item.module.icon];

            return (
              <Link className="module-readiness-card" href={item.module.href} key={item.module.id}>
                <span className={item.pillClassName}>{item.readinessLabel}</span>
                <strong>
                  <Icon size={18} aria-hidden="true" /> {item.module.label}
                </strong>
                <small>{item.modeLabel}</small>
                <p>{item.module.readiness.summary}</p>
                <span className="module-readiness-meta">
                  {item.module.readiness.primaryGap || (item.hasPublicRoute ? "Public route declared." : "Admin-only surface.")}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2 style={{ fontSize: "1.35rem" }}>Common workflows</h2>
        <table className="table">
          <tbody>
            {commonWorkflows.map((workflow) => (
              <tr key={workflow.label}>
                <td>{workflow.label}</td>
                <td>
                  Go to <Link href={workflow.href}>{workflow.href.replace("/admin/modules/", "")}</Link>. {workflow.detail}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 style={{ fontSize: "1.35rem" }}>Security and compliance foundations</h2>
        <div className="foundation-list">
          {platformFoundationItems.map((item) => (
            <div className="foundation-row" key={item.key}>
              <span className={item.status === "schema-ready" ? "pill success" : "pill warning"}>{item.status.replaceAll("-", " ")}</span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
                <small>Models: {item.models.join(", ")}</small>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 style={{ fontSize: "1.35rem" }}>If a time is missing from booking</h2>
        <p className="lead" style={{ fontSize: "0.95rem" }}>
          Check that the service is active, weekly availability exists, there is no blockout, minimum notice has passed,
          the selected date is inside the advance booking window, and no appointment or buffer is already using that time.
        </p>
      </section>
    </div>
  );
}
