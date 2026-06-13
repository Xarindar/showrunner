import { BookingStatus, EmailCategory } from "@prisma/client";
import type { BillingDocumentEmailInput } from "@/lib/billing/documents";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getSiteSettings, getSiteSettingsForSite } from "@/lib/site";
import { queueAdminEmail, queueEmail } from "./queue";
import type { EmailTokens } from "./types";

type BookingForEmail = {
  id: string;
  siteId?: string;
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
  siteId?: string;
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
  siteId?: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  currency: string;
  totalCents: number;
  checkoutUrl?: string | null;
  receiptUrl?: string | null;
};

type BookingStatusEmailOptions = {
  idempotencyKey?: string;
  logLabel?: string;
  templateKey?: string;
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

async function settingsForSite(siteId?: string) {
  return siteId ? getSiteSettingsForSite(siteId) : getSiteSettings();
}

async function bookingTokens(booking: BookingForEmail): Promise<EmailTokens> {
  const settings = await settingsForSite(booking.siteId);

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
        siteId: booking.siteId,
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
        siteId: booking.siteId,
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

export async function queueBookingStatusEmail(
  booking: BookingForEmail,
  previousStatus?: BookingStatus,
  options: BookingStatusEmailOptions = {}
) {
  if (!options.templateKey && previousStatus && previousStatus === booking.status) return;

  const tokens = await bookingTokens(booking);

  if (options.templateKey) {
    const templateKey = options.templateKey;
    await logQueueError(options.logLabel || "booking-status-customer", () =>
      queueEmail({
        siteId: booking.siteId,
        templateKey,
        recipientEmail: booking.customerEmail,
        recipientName: booking.customerName,
        category: EmailCategory.TRANSACTIONAL,
        relatedType: "booking",
        relatedId: booking.id,
        tokens,
        idempotencyKey: options.idempotencyKey || `booking:${booking.id}:${templateKey}:customer`
      })
    );
    return;
  }

  if (booking.status === BookingStatus.CONFIRMED) {
    await logQueueError("booking-confirmed-customer", () =>
      queueEmail({
        siteId: booking.siteId,
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
        siteId: booking.siteId,
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
        siteId: booking.siteId,
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
  const settings = await settingsForSite(form.siteId);
  const tokens: EmailTokens = {
    businessName: settings.businessName,
    formName: form.name,
    submitterName: submission.submitterName || "Website visitor",
    submitterEmail: submission.submitterEmail || "Not provided",
    submissionSummary: submissionSummary(submission.data)
  };

  await logQueueError("form-submitted-admin", () =>
    queueAdminEmail({
      siteId: form.siteId,
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
  siteId?: string;
  publicUrl: string;
  idempotencyKey: string;
}) {
  const settings = await settingsForSite(input.siteId);
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
      siteId: input.siteId,
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
  const settings = await settingsForSite(order.siteId);
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
      siteId: order.siteId,
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

export async function queueOrderReceiptEmail(order: OrderForEmail) {
  const settings = await settingsForSite(order.siteId);
  const receiptUrl = order.receiptUrl || order.checkoutUrl || `/cart?order=${encodeURIComponent(order.orderNumber)}`;
  const tokens: EmailTokens = {
    businessName: settings.businessName,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    orderNumber: order.orderNumber,
    orderTotal: formatMoney(order.totalCents, order.currency),
    paymentProvider: "Stripe Checkout",
    paymentStatus: "paid",
    receiptUrl
  };

  await logQueueError("order-receipt-customer", () =>
    queueEmail({
      siteId: order.siteId,
      templateKey: "order.receipt.customer",
      recipientEmail: order.customerEmail,
      recipientName: order.customerName,
      category: EmailCategory.TRANSACTIONAL,
      relatedType: "order",
      relatedId: order.id,
      tokens,
      idempotencyKey: `order:${order.id}:receipt:customer`
    })
  );
}
