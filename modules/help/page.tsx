import Link from "next/link";
import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  Gauge,
  Image,
  LayoutTemplate,
  Mail,
  ReceiptText,
  Settings,
  Users,
  Workflow
} from "lucide-react";

export const dynamic = "force-dynamic";

const guideSections = [
  {
    title: "Dashboard",
    icon: BookOpen,
    body: "Use the dashboard as the quick overview for upcoming appointments and shortcuts into daily admin work."
  },
  {
    title: "Appointments",
    icon: CalendarCheck,
    body: "Appointments are the day-to-day queue. Open an appointment to review customer details, intake answers, policy acceptance, internal notes, and status actions."
  },
  {
    title: "Clients",
    icon: Users,
    body: "Clients are long-term records. Public bookings create or update clients by email, then store appointment history and internal notes."
  },
  {
    title: "Scheduling",
    icon: CalendarDays,
    body: "Scheduling controls services, availability, blockouts, buffers, minimum notice, booking windows, intake prompts, and policies."
  },
  {
    title: "Content",
    icon: LayoutTemplate,
    body: "Content changes simple public-site copy and hero imagery without exposing full site design controls."
  },
  {
    title: "Media",
    icon: Image,
    body: "Media uses repo assets by default. R2 uploads become available when the site is configured for upload-heavy clients."
  },
  {
    title: "Portfolio",
    icon: Image,
    body: "Portfolio manages photography galleries, image records, proofing options, private access links, and rights notes."
  },
  {
    title: "Communications",
    icon: Mail,
    body: "Communications manages message templates, delivery records, and suppression entries for email and future SMS flows."
  },
  {
    title: "Billing",
    icon: ReceiptText,
    body: "Billing creates quotes, invoices, contracts, line items, attachments, and status records for money-related workflows."
  },
  {
    title: "Automation",
    icon: Workflow,
    body: "Automation defines trigger-action rules, run records, and webhook endpoints that future background jobs can execute."
  },
  {
    title: "Analytics",
    icon: Gauge,
    body: "Analytics records standard events, source attribution, module metrics, and conversion goals for reporting."
  },
  {
    title: "Settings",
    icon: Settings,
    body: "Settings controls business identity, contact email, timezone, theme color, media mode, and enabled modules."
  }
];

export default function HelpPage() {
  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Help</p>
          <h1 style={{ fontSize: "2.4rem" }}>Admin user guide</h1>
          <p>Plain-language operating notes for the business owner or staff member using this admin panel.</p>
        </div>
      </header>

      <section className="grid-2">
        {guideSections.map((section) => {
          const Icon = section.icon;

          return (
            <div className="card" key={section.title}>
              <Icon size={22} />
              <h2 style={{ fontSize: "1.35rem" }}>{section.title}</h2>
              <p className="lead" style={{ fontSize: "0.95rem" }}>
                {section.body}
              </p>
            </div>
          );
        })}
      </section>

      <section className="card">
        <h2 style={{ fontSize: "1.35rem" }}>Common workflows</h2>
        <table className="table">
          <tbody>
            <tr>
              <td>Add or edit bookable time</td>
              <td>
                Go to <Link href="/admin/modules/scheduling">Scheduling</Link>, then update services, availability, or blockouts.
              </td>
            </tr>
            <tr>
              <td>Manage a new booking</td>
              <td>
                Go to <Link href="/admin/modules/appointments">Appointments</Link>, open the customer, then confirm, cancel, or complete it.
              </td>
            </tr>
            <tr>
              <td>Review a returning client</td>
              <td>
                Go to <Link href="/admin/modules/clients">Clients</Link>, open the client, then review notes and appointment history.
              </td>
            </tr>
            <tr>
              <td>Change homepage copy</td>
              <td>
                Go to <Link href="/admin/modules/content">Content</Link>, edit the fields, save, and check the public homepage.
              </td>
            </tr>
            <tr>
              <td>Create a client gallery</td>
              <td>
                Go to <Link href="/admin/modules/portfolio">Portfolio</Link>, create the gallery, add image records, then issue access links if it is private.
              </td>
            </tr>
            <tr>
              <td>Review conversion activity</td>
              <td>
                Go to <Link href="/admin/modules/analytics">Analytics</Link>, review event volume, source attribution, and conversion goal progress.
              </td>
            </tr>
          </tbody>
        </table>
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
