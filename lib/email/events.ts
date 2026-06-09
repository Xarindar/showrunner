import { BookingStatus, EmailCategory } from "@prisma/client";
import type { BillingDocumentEmailInput } from "@/lib/billing/documents";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getSiteSettings } from "@/lib/site";
import { queueAdminEmail, queueEmail } from "./queue";
import type { EmailTokens } from "./types";

type BookingForEmail = {
  id: string;
  customerName: string;
  customerEmail: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  cancellationReason?: string | null;
  service: {
    name: string;
  };
};

type FormForEmail = {
  id: string;
  name: string;
  notificationEmail?: string | null;
};

type FormSubmissionForEmail = {
  id: string;
  submitterName: string;
  submitterEmail: string;
  data: Record<string, unknown>;
};

type OrderForEmail = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  currency: string;
  totalCents: number;
};

function endTime(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en", {
    timeStyle: "short",
    timeZone
  }).format(value);
}

function appointmentTime(booking: BookingForEmail, timeZone: string) {
  return `${formatDateTime(booking.startsAt, timeZone)} - ${endTime(booking.endsAt, timeZone)}`;
}

async function bookingTokens(booking: BookingForEmail): Promise<EmailTokens> {
  const settings = await getSiteSettings();

  return {
    businessName: settings.businessName,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    serviceName: booking.service.name,
    appointmentStartsAt: booking.startsAt,
    appointmentEndsAt: booking.endsAt,
    appointmentTime: appointmentTime(booking, settings.timezone),
    timezone: settings.timezone,
    bookingStatus: booking.status,
    cancellationReason: booking.cancellationReason || "No reason provided.",
    delayReason: ""
  };
}

async function logQueueError(label: string, callback: () => Promise<void>) {
  try {
    await callback();
  } catch (error) {
    console.error(`[email:${label}]`, error);
  }
}

export async function queueBookingCreatedEmails(booking: BookingForEmail) {
  const tokens = await bookingTokens(booking);

  await Promise.all([
    logQueueError("booking-created-customer", () =>
      queueEmail({
        templateKey: "booking.created.customer",
        recipientEmail: booking.customerEmail,
        recipientName: booking.customerName,
        category: EmailCategory.TRANSACTIONAL,
        relatedType: "booking",
        relatedId: booking.id,
        tokens,
        idempotencyKey: `booking:${booking.id}:created:customer`
      })
    ),
    logQueueError("booking-created-admin", () =>
      queueAdminEmail({
        templateKey: "booking.created.admin",
        groupKey: "bookings",
        relatedType: "booking",
        relatedId: booking.id,
        tokens,
        idempotencyKeyBase: `booking:${booking.id}:created`
      })
    )
  ]);
}

export async function queueBookingStatusEmail(booking: BookingForEmail, previousStatus?: BookingStatus) {
  if (previousStatus && previousStatus === booking.status) return;

  const tokens = await bookingTokens(booking);

  if (booking.status === BookingStatus.CONFIRMED) {
    await logQueueError("booking-confirmed-customer", () =>
      queueEmail({
        templateKey: "booking.confirmed.customer",
        recipientEmail: booking.customerEmail,
        recipientName: booking.customerName,
        category: EmailCategory.TRANSACTIONAL,
        relatedType: "booking",
        relatedId: booking.id,
        tokens,
        idempotencyKey: `booking:${booking.id}:confirmed:customer`
      })
    );
  }

  if (booking.status === BookingStatus.CANCELED) {
    await logQueueError("booking-canceled-customer", () =>
      queueEmail({
        templateKey: "booking.canceled.customer",
        recipientEmail: booking.customerEmail,
        recipientName: booking.customerName,
        category: EmailCategory.TRANSACTIONAL,
        relatedType: "booking",
        relatedId: booking.id,
        tokens,
        idempotencyKey: `booking:${booking.id}:canceled:customer`
      })
    );
  }

  if (booking.status === BookingStatus.COMPLETED) {
    await logQueueError("booking-completed-admin", () =>
      queueAdminEmail({
        templateKey: "booking.completed.admin",
        groupKey: "bookings",
        relatedType: "booking",
        relatedId: booking.id,
        tokens,
        idempotencyKeyBase: `booking:${booking.id}:completed`
      })
    );
  }
}

function submissionSummary(data: Record<string, unknown>) {
  return Object.entries(data)
    .map(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value) && "value" in value) {
        const entry = value as { label?: unknown; value?: unknown };
        return `${String(entry.label || key)}: ${entry.value === null || entry.value === undefined ? "" : String(entry.value)}`;
      }

      return `${key}: ${value === null || value === undefined ? "" : String(value)}`;
    })
    .join("\n")
    .slice(0, 2000);
}

export async function queueFormSubmittedEmail(form: FormForEmail, submission: FormSubmissionForEmail) {
  const settings = await getSiteSettings();
  const tokens: EmailTokens = {
    businessName: settings.businessName,
    formName: form.name,
    submitterName: submission.submitterName || "Website visitor",
    submitterEmail: submission.submitterEmail || "Not provided",
    submissionSummary: submissionSummary(submission.data)
  };

  await logQueueError("form-submitted-admin", () =>
    queueAdminEmail({
      templateKey: "form.submitted.admin",
      groupKey: "forms",
      overrideEmail: form.notificationEmail,
      relatedType: "formSubmission",
      relatedId: submission.id,
      tokens,
      idempotencyKeyBase: `form:${submission.id}:submitted`
    })
  );
}

export async function queueBillingDocumentEmail(input: {
  document: BillingDocumentEmailInput;
  publicUrl: string;
  idempotencyKey: string;
}) {
  const settings = await getSiteSettings();
  const dueAt = input.document.dueAt ? formatDateTime(input.document.dueAt, settings.timezone) : "No due date";
  const tokens: EmailTokens = {
    businessName: settings.businessName,
    customerName: input.document.customerName,
    customerEmail: input.document.customerEmail,
    documentNumber: input.document.documentNumber,
    documentType: input.document.type.toLowerCase(),
    documentStatus: input.document.status.toLowerCase(),
    documentTotal: formatMoney(input.document.totalCents, input.document.currency),
    documentDueAt: dueAt,
    publicDocumentUrl: input.publicUrl,
    paymentUrl: input.document.checkoutUrl || "",
    checkoutProvider: input.document.checkoutProvider || "STRIPE",
    publicMemo: input.document.publicMemo
  };

  await logQueueError("billing-document-customer", () =>
    queueEmail({
      templateKey: "billing.document.customer",
      recipientEmail: input.document.customerEmail,
      recipientName: input.document.customerName,
      category: EmailCategory.TRANSACTIONAL,
      relatedType: "billingDocument",
      relatedId: input.document.id,
      tokens,
      idempotencyKey: input.idempotencyKey
    })
  );
}

export async function queueOrderCheckoutEmail(order: OrderForEmail) {
  const settings = await getSiteSettings();
  const tokens: EmailTokens = {
    businessName: settings.businessName,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    orderNumber: order.orderNumber,
    orderTotal: formatMoney(order.totalCents, order.currency),
    paymentProvider: "Stripe Checkout",
    paymentStatus: "pending"
  };

  await logQueueError("order-checkout-customer", () =>
    queueEmail({
      templateKey: "order.checkout.customer",
      recipientEmail: order.customerEmail,
      recipientName: order.customerName,
      category: EmailCategory.TRANSACTIONAL,
      relatedType: "order",
      relatedId: order.id,
      tokens,
      idempotencyKey: `order:${order.id}:checkout-prepared:customer`
    })
  );
}
