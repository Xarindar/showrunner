import type { Metadata } from "next";
import styles from "./payment.module.css";
import { notFound, redirect } from "next/navigation";
import { findBookingPayment, startBookingCheckout } from "@/lib/bookings/payment";
import { publicBillingPath } from "@/lib/billing/documents";
import { formatDateTime, formatMoney } from "@/lib/format";
import { icsCalendarAdapter } from "@/lib/scheduling/calendar";

export const metadata: Metadata = {
  title: "Booking payment",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};

export default async function BookingPaymentPage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const [{ token }, { checkout }] = await Promise.all([params, searchParams]);
  const document = await findBookingPayment(token);
  if (!document?.booking) notFound();

  const paid = document.status === "PAID";
  const confirmed = paid && document.booking.status === "CONFIRMED";
  const bookingTarget = { bookingId: document.booking.id, siteId: document.siteId };
  const closed = document.status === "VOID" || document.booking.status !== "PENDING" || document.booking.startsAt <= new Date() ||
    Boolean(document.dueAt && document.dueAt <= new Date() && !document.payments[0]?.externalCheckoutSession);
  const path = publicBillingPath(token);
  const total = formatMoney(document.totalCents, document.currency);
  const timeZone = document.site.settings?.timezone || "America/Chicago";

  async function pay() {
    "use server";
    redirect(await startBookingCheckout(token));
  }

  return <main className={styles.payment}>
    <h1>{paid ? (document.booking.status === "CANCELED" ? "Booking canceled" : "Booking confirmed") : closed ? "Payment unavailable" : "Booking payment"}</h1>
    <p>{document.site.name} · {document.booking.sessionName || "Appointment"}<br />
      {formatDateTime(document.booking.startsAt, timeZone)} ({timeZone})</p>
    {paid && <p>Payment received. Check your email for the booking details.</p>}
    {confirmed && <ul>
      <li><a href={icsCalendarAdapter.bookingPath(bookingTarget)}>Add to calendar</a></li>
    </ul>}
    {!paid && closed && <p>This booking can no longer be paid online. Contact us for help.</p>}
    {!paid && !closed && (checkout === "success" ?
      <><p>We’re waiting for payment confirmation. Check your email or refresh this page in a moment.</p><a href={`${path}?checkout=success`}>Check payment status</a>{!document.payments.length && <p><a href={path}>Return to payment</a></p>}</> :
      <>
        <p>Total due {total}</p>
        <p>Your booking will be confirmed after payment.</p>
        {checkout === "cancel" && <p>Checkout was canceled. You can resume payment below.</p>}
        {checkout === "unavailable" && <p>Online payment is temporarily unavailable. Contact us for help.</p>}
        {checkout === "error" && <p>Checkout could not open. Try again shortly or contact us for help.</p>}
        <form action={pay}><button type="submit">Pay {total}</button></form>
      </>
    )}
  </main>;
}
