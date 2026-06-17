import Link from "next/link";
import { notFound } from "next/navigation";
import { BillingDocumentStatus, FormSignatureCaptureType, OrderStatus, PaymentStatus, PortfolioAccessStatus, PortfolioGalleryStatus } from "@prisma/client";
import { CalendarCheck, FileText, Images, Package, PenLine, Receipt, User } from "lucide-react";
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
  if (["PAID", "ACCEPTED", "CONFIRMED", "COMPLETED", "FULFILLED"].includes(status)) return "ui-badge ui-badge-success";
  if (["CANCELED", "VOID", "OVERDUE", "REFUNDED", "FAILED"].includes(status)) return "ui-badge ui-badge-danger";
  return "ui-badge";
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
      formSubmissions: {
        where: {
          form: { siteId: settings.siteId },
          signatures: { some: { siteId: settings.siteId } }
        },
        include: {
          form: { select: { destination: true, name: true, slug: true } },
          formAttachment: { select: { targetType: true, targetId: true } },
          signatures: {
            include: { formField: { select: { label: true } } },
            orderBy: { signedAt: "desc" }
          }
        },
        orderBy: { createdAt: "desc" },
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
      },
      portfolioGalleryAccesses: {
        where: {
          siteId: settings.siteId,
          status: PortfolioAccessStatus.ACTIVE,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          gallery: { status: PortfolioGalleryStatus.PUBLISHED }
        },
        include: {
          gallery: {
            include: {
              _count: { select: { items: true, proofRounds: true } }
            }
          }
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
      portalAccessVersion: client.portalAccessVersion,
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

      <section className="section ui-zero">
        <div className="stack">
          <header className="page-header">
            <div>
              <p className="eyebrow">Client portal</p>
              <h1>{client.name}</h1>
              <p>{client.email}</p>
            </div>
            <span className="ui-badge">{settings.businessName}</span>
          </header>

          <section className="grid-3">
            <div className="ui-card ui-card-density-normal ui-card-min-md">
              <CalendarCheck size={22} />
              <h2 className="ui-zero">Upcoming</h2>
              <p>{upcomingBookings.length} appointments</p>
            </div>
            <div className="ui-card ui-card-density-normal ui-card-min-md">
              <Package size={22} />
              <h2 className="ui-zero">Orders</h2>
              <p>{client.orders.length} orders</p>
            </div>
            <div className="ui-card ui-card-density-normal ui-card-min-md">
              <Receipt size={22} />
              <h2 className="ui-zero">Open billing</h2>
              <p>{openBillingDocuments.length} documents</p>
            </div>
            <div className="ui-card ui-card-density-normal ui-card-min-md">
              <PenLine size={22} />
              <h2 className="ui-zero">Signed forms</h2>
              <p>{client.formSubmissions.length} records</p>
            </div>
            <div className="ui-card ui-card-density-normal ui-card-min-md">
              <Images size={22} />
              <h2 className="ui-zero">Galleries</h2>
              <p>{client.portfolioGalleryAccesses.length} galleries</p>
            </div>
          </section>

          <section className="ui-card ui-card-density-normal ui-card-min-md">
            <div className="page-header compact-header">
              <div>
                <CalendarCheck size={22} />
                <h2 className="section-title">Appointments</h2>
              </div>
            </div>
            <table className="ui-table">
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
                          <span className="muted-text">{booking.service.location}</span>
                        </>
                      ) : null}
                      {booking.resources.length ? (
                        <>
                          <br />
                          <span className="muted-text">
                            {booking.resources.map((bookingResource) => bookingResource.resource.name).join(", ")}
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      {formatDateTime(booking.startsAt, settings.timezone)}
                      <br />
                      <span className="muted-text">Ends {formatDateTime(booking.endsAt, settings.timezone)}</span>
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

          <section className="ui-card ui-card-density-normal ui-card-min-md">
            <div className="page-header compact-header">
              <div>
                <PenLine size={22} />
                <h2 className="section-title">Signed forms and documents</h2>
              </div>
            </div>
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Signed by</th>
                  <th>Signature</th>
                  <th>Signed</th>
                </tr>
              </thead>
              <tbody>
                {client.formSubmissions.map((submission) => (
                  <tr key={submission.id}>
                    <td>
                      <strong>{submission.form.name}</strong>
                      <br />
                      <span className="muted-text">
                        {enumLabel(submission.form.destination)}
                        {submission.formAttachment ? ` for ${enumLabel(submission.formAttachment.targetType)}` : ""}
                      </span>
                    </td>
                    <td>
                      {submission.submitterName || submission.signatures[0]?.signerName || client.name}
                      <br />
                      <span className="muted-text">{submission.submitterEmail || submission.signatures[0]?.signerEmail || client.email}</span>
                    </td>
                    <td>
                      {submission.signatures.map((signature) => (
                        <div className="ui-zero" key={signature.id}>
                          <strong>{signature.formField.label}</strong>
                          <br />
                          {signature.captureType === FormSignatureCaptureType.TYPED ? (
                            <span>{signature.capturedSignature}</span>
                          ) : (
                            <span>Drawn signature on file</span>
                          )}
                          <br />
                          <span className="muted-text">{signature.consentStatement}</span>
                        </div>
                      ))}
                    </td>
                    <td>{formatDateTime(submission.signatures[0]?.signedAt || submission.createdAt, settings.timezone)}</td>
                  </tr>
                ))}
                {!client.formSubmissions.length ? (
                  <tr>
                    <td colSpan={4}>No signed forms yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          <section className="ui-card ui-card-density-normal ui-card-min-md">
            <div className="page-header compact-header">
              <div>
                <Images size={22} />
                <h2 className="section-title">Galleries</h2>
              </div>
            </div>
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Gallery</th>
                  <th>Access</th>
                  <th>Contents</th>
                  <th>Last viewed</th>
                </tr>
              </thead>
              <tbody>
                {client.portfolioGalleryAccesses.map((access) => (
                  <tr key={access.id}>
                    <td>
                      <Link href={`/galleries/access/${access.accessToken}`}>
                        <strong>{access.gallery.title}</strong>
                      </Link>
                      {access.gallery.description ? (
                        <>
                          <br />
                          <span className="muted-text">{access.gallery.description}</span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <span className={statusClass(access.status)}>{enumLabel(access.status)}</span>
                      <br />
                      <span className="muted-text">
                        {access.expiresAt ? `Expires ${formatDateTime(access.expiresAt, settings.timezone)}` : "No expiration"}
                      </span>
                    </td>
                    <td>
                      {access.gallery._count.items} items
                      <br />
                      <span className="muted-text">{access.gallery._count.proofRounds} proofing rounds</span>
                    </td>
                    <td>{access.lastViewedAt ? formatDateTime(access.lastViewedAt, settings.timezone) : "Not viewed yet"}</td>
                  </tr>
                ))}
                {!client.portfolioGalleryAccesses.length ? (
                  <tr>
                    <td colSpan={4}>No galleries shared yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>

          <section className="ui-card ui-card-density-normal ui-card-min-md">
            <div className="page-header compact-header">
              <div>
                <Package size={22} />
                <h2 className="section-title">Orders</h2>
              </div>
            </div>
            <table className="ui-table">
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
                      <span className="muted-text">{formatDateTime(order.placedAt || order.createdAt, settings.timezone)}</span>
                    </td>
                    <td>
                      {order.items.slice(0, 3).map((item) => (
                        <span key={item.id}>
                          {item.quantity} x {item.name}
                          <br />
                        </span>
                      ))}
                      {order.items.length > 3 ? <span className="muted-text">+{order.items.length - 3} more</span> : null}
                    </td>
                    <td>
                      {formatMoney(order.totalCents, order.currency)}
                      <br />
                      <span className="muted-text">{formatMoney(remainingCents(order.totalCents, order.payments), order.currency)} balance</span>
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

          <section className="ui-card ui-card-density-normal ui-card-min-md">
            <div className="page-header compact-header">
              <div>
                <FileText size={22} />
                <h2 className="section-title">Invoices and documents</h2>
              </div>
            </div>
            <table className="ui-table">
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
                        <span className="muted-text">
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

          <section className="ui-card ui-card-density-normal ui-card-min-md">
            <User size={22} />
            <h2 className="section-title">Profile</h2>
            <p>
              {client.name}
              <br />
              <span className="muted-text">{client.phone || client.email}</span>
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
