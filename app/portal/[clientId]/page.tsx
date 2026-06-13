import Link from "next/link";
import { notFound } from "next/navigation";
import { BillingDocumentStatus, OrderStatus, PaymentStatus } from "@prisma/client";
import { CalendarCheck, FileText, Package, Receipt, User } from "lucide-react";
import { verifyClientPortalToken } from "@/lib/clients/portal-token";
import { enumLabel, formatDateTime, formatMoney } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { themeToCssVars } from "@/lib/theme/tokens";

export const dynamic = "force-dynamic";

type ClientPortalPageProps = {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ token?: string }>;
};

function statusClass(status: string) {
  if (["PAID", "ACCEPTED", "CONFIRMED", "COMPLETED", "FULFILLED"].includes(status)) return "pill success";
  if (["CANCELED", "VOID", "OVERDUE", "REFUNDED", "FAILED"].includes(status)) return "pill danger";
  return "pill";
}

function paidCents(payments: Array<{ amountCents: number; refundedCents?: number; status: PaymentStatus }>) {
  return payments
    .filter((payment) => payment.status === PaymentStatus.PAID || payment.status === PaymentStatus.AUTHORIZED)
    .reduce((sum, payment) => sum + Math.max(0, payment.amountCents - (payment.refundedCents || 0)), 0);
}

function remainingCents(totalCents: number, payments: Array<{ amountCents: number; refundedCents?: number; status: PaymentStatus }>) {
  return Math.max(0, totalCents - paidCents(payments));
}

export default async function ClientPortalPage({ params, searchParams }: ClientPortalPageProps) {
  const [{ clientId }, { token = "" }, settings] = await Promise.all([params, searchParams, getSiteSettings()]);
  if (!settings.enabledModuleIds.includes("clients")) notFound();

  const client = await prisma.client.findFirst({
    where: { id: clientId, siteId: settings.siteId },
    include: {
      bookings: {
        include: {
          service: { select: { name: true, location: true } },
          staff: { select: { name: true } },
          resources: { include: { resource: { select: { name: true } } } }
        },
        orderBy: { startsAt: "desc" },
        take: 50
      },
      billingDocuments: {
        where: { status: { not: BillingDocumentStatus.DRAFT } },
        include: { payments: { orderBy: { createdAt: "desc" } } },
        orderBy: { updatedAt: "desc" },
        take: 50
      },
      orders: {
        where: { status: { not: OrderStatus.DRAFT } },
        include: {
          items: { orderBy: { createdAt: "asc" } },
          payments: { orderBy: { createdAt: "desc" } }
        },
        orderBy: { updatedAt: "desc" },
        take: 50
      }
    }
  });

  if (
    !client ||
    !verifyClientPortalToken({
      clientId: client.id,
      email: client.email,
      siteId: settings.siteId,
      token
    })
  ) {
    notFound();
  }

  const upcomingBookings = client.bookings.filter((booking) => booking.startsAt >= new Date() && booking.status !== "CANCELED");
  const pastBookings = client.bookings.filter((booking) => booking.startsAt < new Date() || booking.status === "CANCELED");
  const openBillingDocuments = client.billingDocuments.filter((document) => remainingCents(document.totalCents, document.payments) > 0);

  return (
    <main className="site-shell" style={themeToCssVars(settings)}>
      <nav className="site-nav">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{settings.businessName}</span>
        </Link>
      </nav>

      <section className="section" style={{ paddingTop: 22 }}>
        <div className="stack">
          <header className="page-header">
            <div>
              <p className="eyebrow">Client portal</p>
              <h1 style={{ fontSize: "2.35rem" }}>{client.name}</h1>
              <p>{client.email}</p>
            </div>
            <span className="pill">{settings.businessName}</span>
          </header>

          <section className="grid-3">
            <div className="card">
              <CalendarCheck size={22} />
              <h2 style={{ fontSize: "1.25rem" }}>Upcoming</h2>
              <p>{upcomingBookings.length} appointments</p>
            </div>
            <div className="card">
              <Package size={22} />
              <h2 style={{ fontSize: "1.25rem" }}>Orders</h2>
              <p>{client.orders.length} orders</p>
            </div>
            <div className="card">
              <Receipt size={22} />
              <h2 style={{ fontSize: "1.25rem" }}>Open billing</h2>
              <p>{openBillingDocuments.length} documents</p>
            </div>
          </section>

          <section className="card">
            <div className="page-header" style={{ marginBottom: 16 }}>
              <div>
                <CalendarCheck size={22} />
                <h2 style={{ fontSize: "1.35rem" }}>Appointments</h2>
              </div>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>When</th>
                  <th>Staff</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...upcomingBookings, ...pastBookings].map((booking) => (
                  <tr key={booking.id}>
                    <td>
                      <strong>{booking.service.name}</strong>
                      {booking.service.location ? (
                        <>
                          <br />
                          <span style={{ color: "var(--muted)" }}>{booking.service.location}</span>
                        </>
                      ) : null}
                      {booking.resources.length ? (
                        <>
                          <br />
                          <span style={{ color: "var(--muted)" }}>
                            {booking.resources.map((bookingResource) => bookingResource.resource.name).join(", ")}
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      {formatDateTime(booking.startsAt, settings.timezone)}
                      <br />
                      <span style={{ color: "var(--muted)" }}>Ends {formatDateTime(booking.endsAt, settings.timezone)}</span>
                    </td>
                    <td>{booking.staff?.name || "Assigned by the business"}</td>
                    <td>
                      <span className={statusClass(booking.status)}>{enumLabel(booking.status)}</span>
                    </td>
                  </tr>
                ))}
                {!client.bookings.length ? (
                  <tr>
                    <td colSpan={4}>No appointment history yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          <section className="card">
            <div className="page-header" style={{ marginBottom: 16 }}>
              <div>
                <Package size={22} />
                <h2 style={{ fontSize: "1.35rem" }}>Orders</h2>
              </div>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {client.orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.orderNumber}</strong>
                      <br />
                      <span style={{ color: "var(--muted)" }}>{formatDateTime(order.placedAt || order.createdAt, settings.timezone)}</span>
                    </td>
                    <td>
                      {order.items.slice(0, 3).map((item) => (
                        <span key={item.id}>
                          {item.quantity} x {item.name}
                          <br />
                        </span>
                      ))}
                      {order.items.length > 3 ? <span style={{ color: "var(--muted)" }}>+{order.items.length - 3} more</span> : null}
                    </td>
                    <td>
                      {formatMoney(order.totalCents, order.currency)}
                      <br />
                      <span style={{ color: "var(--muted)" }}>{formatMoney(remainingCents(order.totalCents, order.payments), order.currency)} balance</span>
                    </td>
                    <td>
                      <span className={statusClass(order.status)}>{enumLabel(order.status)}</span>
                    </td>
                  </tr>
                ))}
                {!client.orders.length ? (
                  <tr>
                    <td colSpan={4}>No orders yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          <section className="card">
            <div className="page-header" style={{ marginBottom: 16 }}>
              <div>
                <FileText size={22} />
                <h2 style={{ fontSize: "1.35rem" }}>Invoices and documents</h2>
              </div>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Total</th>
                  <th>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {client.billingDocuments.map((document) => {
                  const balanceCents = remainingCents(document.totalCents, document.payments);
                  return (
                    <tr key={document.id}>
                      <td>
                        <strong>{document.documentNumber}</strong>
                        <br />
                        <span style={{ color: "var(--muted)" }}>
                          {enumLabel(document.type)} {document.dueAt ? `due ${formatDateTime(document.dueAt, settings.timezone)}` : ""}
                        </span>
                      </td>
                      <td>{formatMoney(document.totalCents, document.currency)}</td>
                      <td>{formatMoney(balanceCents, document.currency)}</td>
                      <td>
                        <span className={statusClass(document.status)}>{enumLabel(document.status)}</span>
                      </td>
                    </tr>
                  );
                })}
                {!client.billingDocuments.length ? (
                  <tr>
                    <td colSpan={4}>No billing documents yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          <section className="card">
            <User size={22} />
            <h2 style={{ fontSize: "1.35rem" }}>Profile</h2>
            <p>
              {client.name}
              <br />
              <span style={{ color: "var(--muted)" }}>{client.phone || client.email}</span>
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
