import "dotenv/config";
import { randomBytes } from "crypto";
import {
  AdminRole,
  AnalyticsEventType,
  AutomationAction,
  AutomationStatus,
  AutomationTrigger,
  BillingDocumentStatus,
  BillingDocumentType,
  CouponType,
  FormDestination,
  FormFieldRole,
  FormFieldType,
  FormStatus,
  MessageChannel,
  MessageTemplatePurpose,
  PortfolioGalleryStatus,
  PortfolioGalleryVisibility,
  PortfolioItemType,
  ProductStatus,
  ProductType,
  PrismaClient,
  TestimonialStatus
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import {
  DEFAULT_SITE_ID,
  DEFAULT_SITE_NAME,
  DEFAULT_SITE_SLUG,
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_SLUG
} from "../lib/site-boundary";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/showrunner"
});
const prisma = new PrismaClient({ adapter });

function generateSigningSecret() {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

const enabledModules = [
  "dashboard",
  "content",
  "appointments",
  "clients",
  "scheduling",
  "media",
  "portfolio",
  "forms",
  "testimonials",
  "products",
  "communications",
  "billing",
  "automation",
  "analytics",
  "settings",
  "help"
];

async function seedEmailCore(businessName: string, contactEmail: string, siteId = DEFAULT_SITE_ID) {
  const sender = await prisma.emailSenderIdentity.upsert({
    where: { id: "email-sender-default" },
    update: {
      name: businessName,
      fromEmail: contactEmail,
      replyToEmail: contactEmail
    },
    create: {
      id: "email-sender-default",
      siteId,
      name: businessName,
      fromEmail: contactEmail,
      replyToEmail: contactEmail,
      isDefault: true,
      isVerified: false
    }
  });

  for (const group of [
    { id: "email-group-bookings", key: "bookings", label: "Bookings" },
    { id: "email-group-forms", key: "forms", label: "Forms" },
    { id: "email-group-billing", key: "billing", label: "Billing" },
    { id: "email-group-campaigns", key: "campaigns", label: "Campaigns" },
    { id: "email-group-system", key: "system", label: "System" }
  ]) {
    await prisma.emailRecipientGroup.upsert({
      where: { siteId_key: { siteId, key: group.key } },
      update: { label: group.label, fallbackToContactEmail: true, isActive: true },
      create: { ...group, siteId, fallbackToContactEmail: true, isActive: true }
    });
  }

  for (const groupId of ["email-group-bookings", "email-group-forms", "email-group-billing"]) {
    await prisma.emailRecipient.upsert({
      where: { groupId_email: { groupId, email: contactEmail } },
      update: { name: businessName, isActive: true },
      create: { groupId, email: contactEmail, name: businessName, isActive: true }
    });
  }

  await prisma.emailSubscriptionList.upsert({
    where: { id: "email-list-newsletter" },
    update: { isDefault: true },
      create: {
        id: "email-list-newsletter",
        siteId,
        name: "Newsletter",
      description: "Default marketing list for site updates and announcements.",
      isDefault: true
    }
  });

  const templates = [
    {
      id: "email-template-booking-created-customer",
      key: "booking.created.customer",
      name: "Booking request received",
      description: "Sent to the customer after a public booking request is saved.",
      purpose: MessageTemplatePurpose.BOOKING_CONFIRMATION,
      subject: "{{businessName}} appointment request",
      previewText: "Your appointment request was received.",
      textBody: [
        "Thanks, {{customerName}}.",
        "",
        "Your {{serviceName}} appointment request was received by {{businessName}}.",
        "",
        "Time: {{appointmentTime}}",
        "",
        "The business will follow up if anything needs to change."
      ].join("\n"),
      htmlBody:
        "<p>Thanks, {{customerName}}.</p><p>Your {{serviceName}} appointment request was received by {{businessName}}.</p><p><strong>Time:</strong> {{appointmentTime}}</p><p>The business will follow up if anything needs to change.</p>",
      requiredTokens: ["businessName", "customerName", "serviceName", "appointmentTime"],
      optionalTokens: ["customerEmail", "timezone"]
    },
    {
      id: "email-template-booking-created-admin",
      key: "booking.created.admin",
      name: "New booking alert",
      description: "Sent to booking admins after a public booking request is saved.",
      purpose: MessageTemplatePurpose.ADMIN_DIGEST,
      subject: "New booking: {{serviceName}}",
      previewText: "{{customerName}} booked {{serviceName}}.",
      textBody: ["{{customerName}} booked {{serviceName}}.", "", "Time: {{appointmentTime}}", "Customer email: {{customerEmail}}"].join("\n"),
      htmlBody:
        "<p>{{customerName}} booked {{serviceName}}.</p><p><strong>Time:</strong> {{appointmentTime}}</p><p><strong>Customer email:</strong> {{customerEmail}}</p>",
      requiredTokens: ["customerName", "customerEmail", "serviceName", "appointmentTime"],
      optionalTokens: ["businessName", "timezone"]
    },
    {
      id: "email-template-booking-confirmed-customer",
      key: "booking.confirmed.customer",
      name: "Booking confirmed",
      description: "Sent to the customer when an appointment is confirmed.",
      purpose: MessageTemplatePurpose.BOOKING_CONFIRMATION,
      subject: "Your {{businessName}} appointment is confirmed",
      previewText: "Your appointment is confirmed.",
      textBody: ["Hi {{customerName}},", "", "Your {{serviceName}} appointment with {{businessName}} is confirmed.", "", "Time: {{appointmentTime}}"].join("\n"),
      htmlBody:
        "<p>Hi {{customerName}},</p><p>Your {{serviceName}} appointment with {{businessName}} is confirmed.</p><p><strong>Time:</strong> {{appointmentTime}}</p>",
      requiredTokens: ["businessName", "customerName", "serviceName", "appointmentTime"],
      optionalTokens: ["customerEmail", "timezone"]
    },
    {
      id: "email-template-booking-canceled-customer",
      key: "booking.canceled.customer",
      name: "Booking canceled",
      description: "Sent to the customer when an appointment is canceled.",
      purpose: MessageTemplatePurpose.GENERAL,
      subject: "Your {{businessName}} appointment was canceled",
      previewText: "Your appointment was canceled.",
      textBody: [
        "Hi {{customerName}},",
        "",
        "Your {{serviceName}} appointment with {{businessName}} was canceled.",
        "",
        "Time: {{appointmentTime}}",
        "",
        "Reason: {{cancellationReason}}"
      ].join("\n"),
      htmlBody:
        "<p>Hi {{customerName}},</p><p>Your {{serviceName}} appointment with {{businessName}} was canceled.</p><p><strong>Time:</strong> {{appointmentTime}}</p><p><strong>Reason:</strong> {{cancellationReason}}</p>",
      requiredTokens: ["businessName", "customerName", "serviceName", "appointmentTime"],
      optionalTokens: ["customerEmail", "timezone", "cancellationReason"]
    },
    {
      id: "email-template-booking-delayed-customer",
      key: "booking.delayed.customer",
      name: "Booking delay notice",
      description: "Sent to the customer when an appointment delay is recorded.",
      purpose: MessageTemplatePurpose.GENERAL,
      subject: "Update about your {{businessName}} appointment",
      previewText: "There is an update about your appointment.",
      textBody: [
        "Hi {{customerName}},",
        "",
        "There is an update about your {{serviceName}} appointment with {{businessName}}.",
        "",
        "Time: {{appointmentTime}}",
        "",
        "Reason: {{delayReason}}"
      ].join("\n"),
      htmlBody:
        "<p>Hi {{customerName}},</p><p>There is an update about your {{serviceName}} appointment with {{businessName}}.</p><p><strong>Time:</strong> {{appointmentTime}}</p><p><strong>Reason:</strong> {{delayReason}}</p>",
      requiredTokens: ["businessName", "customerName", "serviceName", "appointmentTime"],
      optionalTokens: ["customerEmail", "timezone", "delayReason"]
    },
    {
      id: "email-template-booking-completed-admin",
      key: "booking.completed.admin",
      name: "Booking completed alert",
      description: "Sent to booking admins when an appointment is marked completed.",
      purpose: MessageTemplatePurpose.ADMIN_DIGEST,
      subject: "Completed booking: {{serviceName}}",
      previewText: "{{customerName}} was marked completed.",
      textBody: ["{{customerName}} was marked completed for {{serviceName}}.", "", "Time: {{appointmentTime}}"].join("\n"),
      htmlBody: "<p>{{customerName}} was marked completed for {{serviceName}}.</p><p><strong>Time:</strong> {{appointmentTime}}</p>",
      requiredTokens: ["customerName", "serviceName", "appointmentTime"],
      optionalTokens: ["businessName", "customerEmail", "timezone"]
    },
    {
      id: "email-template-form-submitted-admin",
      key: "form.submitted.admin",
      name: "Form submission alert",
      description: "Sent to form admins after a public form is submitted.",
      purpose: MessageTemplatePurpose.FORM_SUBMISSION,
      subject: "New form submission: {{formName}}",
      previewText: "{{submitterName}} submitted {{formName}}.",
      textBody: ["A form was submitted.", "", "Form: {{formName}}", "Name: {{submitterName}}", "Email: {{submitterEmail}}", "", "{{submissionSummary}}"].join("\n"),
      htmlBody:
        "<p>A form was submitted.</p><p><strong>Form:</strong> {{formName}}</p><p><strong>Name:</strong> {{submitterName}}</p><p><strong>Email:</strong> {{submitterEmail}}</p><p>{{submissionSummary}}</p>",
      requiredTokens: ["formName", "submissionSummary"],
      optionalTokens: ["businessName", "submitterName", "submitterEmail"]
    },
    {
      id: "email-template-billing-document-customer",
      key: "billing.document.customer",
      name: "Billing document notice",
      description: "Sent to customers with a public invoice, quote, or contract link.",
      purpose: MessageTemplatePurpose.INVOICE_NOTICE,
      subject: "{{businessName}} {{documentType}} {{documentNumber}}",
      previewText: "{{documentTotal}} due for {{documentNumber}}.",
      textBody: [
        "Hi {{customerName}},",
        "",
        "{{businessName}} sent {{documentType}} {{documentNumber}}.",
        "",
        "Total: {{documentTotal}}",
        "Due: {{documentDueAt}}",
        "",
        "View document: {{publicDocumentUrl}}",
        "Payment link: {{paymentUrl}}",
        "",
        "{{publicMemo}}"
      ].join("\n"),
      htmlBody:
        "<p>Hi {{customerName}},</p><p>{{businessName}} sent {{documentType}} {{documentNumber}}.</p><p><strong>Total:</strong> {{documentTotal}}<br /><strong>Due:</strong> {{documentDueAt}}</p><p><a href=\"{{publicDocumentUrl}}\">View document</a></p><p><a href=\"{{paymentUrl}}\">Payment link</a></p><p>{{publicMemo}}</p>",
      requiredTokens: ["businessName", "customerName", "documentType", "documentNumber", "documentTotal", "publicDocumentUrl"],
      optionalTokens: ["customerEmail", "documentStatus", "documentDueAt", "paymentUrl", "checkoutProvider", "publicMemo"]
    },
    {
      id: "email-template-order-checkout-customer",
      key: "order.checkout.customer",
      name: "Order checkout prepared",
      description: "Sent after a public cart is converted into a draft order and hosted checkout handoff record.",
      purpose: MessageTemplatePurpose.ORDER_RECEIPT,
      subject: "{{businessName}} order {{orderNumber}}",
      previewText: "Your order is prepared for hosted checkout.",
      textBody: [
        "Hi {{customerName}},",
        "",
        "Order {{orderNumber}} is prepared with {{paymentProvider}} payment status {{paymentStatus}}.",
        "",
        "Total: {{orderTotal}}",
        "",
        "Pay securely: {{checkoutUrl}}",
        "",
        "{{businessName}} will complete payment collection through hosted checkout. No card details are collected by this site."
      ].join("\n"),
      htmlBody:
        "<p>Hi {{customerName}},</p><p>Order {{orderNumber}} is prepared with {{paymentProvider}} payment status {{paymentStatus}}.</p><p><strong>Total:</strong> {{orderTotal}}</p><p><a href=\"{{checkoutUrl}}\">Pay securely with Stripe</a></p><p>{{businessName}} will complete payment collection through hosted checkout. No card details are collected by this site.</p>",
      requiredTokens: ["businessName", "customerName", "orderNumber", "orderTotal", "paymentProvider", "paymentStatus"],
      optionalTokens: ["customerEmail", "checkoutUrl"]
    },
    {
      id: "email-template-order-receipt-customer",
      key: "order.receipt.customer",
      name: "Order receipt",
      description: "Reserved for paid-order receipts after payment webhooks mark orders paid.",
      purpose: MessageTemplatePurpose.ORDER_RECEIPT,
      subject: "Receipt for {{businessName}} order {{orderNumber}}",
      previewText: "{{orderTotal}} paid for {{orderNumber}}.",
      textBody: [
        "Hi {{customerName}},",
        "",
        "Payment was received for order {{orderNumber}}.",
        "",
        "Total paid: {{orderTotal}}",
        "Receipt: {{receiptUrl}}"
      ].join("\n"),
      htmlBody:
        "<p>Hi {{customerName}},</p><p>Payment was received for order {{orderNumber}}.</p><p><strong>Total paid:</strong> {{orderTotal}}</p><p><a href=\"{{receiptUrl}}\">Receipt</a></p>",
      requiredTokens: ["businessName", "customerName", "orderNumber", "orderTotal"],
      optionalTokens: ["customerEmail", "receiptUrl"]
    }
  ];

  for (const template of templates) {
    await prisma.messageTemplate.upsert({
      where: { siteId_key: { siteId, key: template.key } },
      update: { senderIdentityId: sender.id },
      create: {
        id: template.id,
        siteId,
        key: template.key,
        name: template.name,
        description: template.description,
        purpose: template.purpose,
        channel: MessageChannel.EMAIL,
        subject: template.subject,
        previewText: template.previewText,
        body: template.textBody,
        htmlBody: template.htmlBody,
        textBody: template.textBody,
        tokens: [...template.requiredTokens, ...template.optionalTokens],
        requiredTokens: template.requiredTokens,
        optionalTokens: template.optionalTokens,
        senderIdentityId: sender.id,
        isMarketing: false,
        isActive: true
      }
    });
  }
}

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD || "change-me-now";
  const passwordHash = await bcrypt.hash(password, 12);
  const resetAdminPassword = process.env.RESET_ADMIN_PASSWORD === "true";

  await prisma.tenant.upsert({
    where: { id: DEFAULT_TENANT_ID },
    update: {},
    create: {
      id: DEFAULT_TENANT_ID,
      slug: DEFAULT_TENANT_SLUG,
      name: "Default tenant"
    }
  });

  await prisma.site.upsert({
    where: { id: DEFAULT_SITE_ID },
    update: {},
    create: {
      id: DEFAULT_SITE_ID,
      tenantId: DEFAULT_TENANT_ID,
      slug: DEFAULT_SITE_SLUG,
      name: DEFAULT_SITE_NAME,
      isDefault: true
    }
  });

  const settings = await prisma.siteSettings.upsert({
    where: { siteId: DEFAULT_SITE_ID },
    update: { businessName: "Showrunner", enabledModules },
    create: {
      id: DEFAULT_SITE_ID,
      siteId: DEFAULT_SITE_ID,
      businessName: "Showrunner",
      themePreset: "clean",
      enabledModules
    }
  });

  await seedEmailCore(settings.businessName, settings.contactEmail, settings.siteId);

  await prisma.adminUser.upsert({
    where: { email },
    update: resetAdminPassword ? { passwordHash, role: AdminRole.OWNER } : { role: AdminRole.OWNER },
    create: {
      email,
      passwordHash,
      role: AdminRole.OWNER
    }
  });

  const consultation = await prisma.service.upsert({
    where: { id: "seed-consultation" },
    update: {
      slug: "consultation",
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 15,
      minimumNoticeHours: 12,
      maxAdvanceDays: 60,
      slotIntervalMinutes: 30,
      intakePrompt: "What should we know before this appointment?",
      policyText: "Please cancel or reschedule at least 24 hours before your appointment.",
      requirePolicy: true,
      isActive: true
    },
    create: {
      id: "seed-consultation",
      siteId: settings.siteId,
      slug: "consultation",
      name: "Consultation",
      description: "A focused appointment to understand the project and next steps.",
      durationMinutes: 45,
      location: "Online or in person",
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 15,
      minimumNoticeHours: 12,
      maxAdvanceDays: 60,
      slotIntervalMinutes: 30,
      intakePrompt: "What should we know before this appointment?",
      policyText: "Please cancel or reschedule at least 24 hours before your appointment.",
      requirePolicy: true,
      isActive: true
    }
  });

  const hasAvailability = await prisma.availabilityRule.count({ where: { siteId: settings.siteId } });
  if (!hasAvailability) {
    await prisma.availabilityRule.createMany({
      data: [1, 2, 3, 4, 5].map((weekday) => ({
        siteId: settings.siteId,
        weekday,
        startMinutes: 9 * 60,
        endMinutes: 17 * 60
      }))
    });
  }

  const studioResource = await prisma.resource.upsert({
    where: { id: "seed-studio-a" },
    update: {
      isActive: true,
      name: "Studio A",
      type: "ROOM"
    },
    create: {
      id: "seed-studio-a",
      siteId: settings.siteId,
      name: "Studio A",
      type: "ROOM",
      description: "Sample room resource for resource-backed scheduling.",
      location: "Main studio",
      capacity: 1,
      isActive: true
    }
  });

  await prisma.serviceResource.upsert({
    where: {
      serviceId_resourceId: {
        serviceId: consultation.id,
        resourceId: studioResource.id
      }
    },
    update: {},
    create: {
      siteId: settings.siteId,
      serviceId: consultation.id,
      resourceId: studioResource.id
    }
  });

  const hasResourceAvailability = await prisma.availabilityRule.count({
    where: { siteId: settings.siteId, resourceId: studioResource.id }
  });
  if (!hasResourceAvailability) {
    await prisma.availabilityRule.createMany({
      data: [1, 2, 3, 4, 5].map((weekday) => ({
        siteId: settings.siteId,
        resourceId: studioResource.id,
        weekday,
        startMinutes: 9 * 60,
        endMinutes: 17 * 60
      }))
    });
  }

  console.log(`Seeded admin user ${email}${resetAdminPassword ? " with a reset password" : ""}.`);
  console.log(`Default service: ${consultation.name}`);

  const starterCollection = await prisma.collection.upsert({
    where: { siteId_slug: { siteId: settings.siteId, slug: "featured" } },
    update: {
      status: ProductStatus.ACTIVE,
      isFeatured: true
    },
    create: {
      siteId: settings.siteId,
      slug: "featured",
      name: "Featured",
      description: "Starter collection for highlighted products, packages, or print sales.",
      status: ProductStatus.ACTIVE,
      isFeatured: true
    }
  });

  const starterProduct = await prisma.product.upsert({
    where: { siteId_slug: { siteId: settings.siteId, slug: "starter-package" } },
    update: {
      status: ProductStatus.ACTIVE
    },
    create: {
      siteId: settings.siteId,
      slug: "starter-package",
      name: "Starter Package",
      summary: "A sample commerce item for package, deposit, or product sales.",
      description: "Use this sample to test product copy, pricing, variants, collections, and future checkout flows.",
      type: ProductType.SERVICE_PACKAGE,
      status: ProductStatus.ACTIVE,
      basePriceCents: 12500,
      currency: "USD",
      sku: "STARTER-PACKAGE",
      tags: ["sample", "package"],
      variants: {
        create: [
          {
            name: "Standard",
            sku: "STARTER-PACKAGE-STD",
            optionName: "Package",
            optionValue: "Standard",
            priceCents: 12500,
            isDefault: true,
            isActive: true
          }
        ]
      }
    }
  });

  await prisma.collectionProduct.upsert({
    where: {
      collectionId_productId: {
        collectionId: starterCollection.id,
        productId: starterProduct.id
      }
    },
    update: {},
    create: {
      collectionId: starterCollection.id,
      productId: starterProduct.id
    }
  });

  await prisma.coupon.upsert({
    where: { siteId_code: { siteId: settings.siteId, code: "WELCOME10" } },
    update: {},
    create: {
      siteId: settings.siteId,
      code: "WELCOME10",
      type: CouponType.PERCENT,
      percentOff: 10,
      isActive: true
    }
  });

  console.log(`Starter product: ${starterProduct.name}`);

  const inquiryForm = await prisma.form.upsert({
    where: { siteId_slug: { siteId: settings.siteId, slug: "contact-inquiry" } },
    update: {
      status: FormStatus.ACTIVE,
      destination: FormDestination.INQUIRY
    },
    create: {
      siteId: settings.siteId,
      slug: "contact-inquiry",
      name: "Contact inquiry",
      description: "A public lead form for the example front end.",
      status: FormStatus.ACTIVE,
      destination: FormDestination.INQUIRY,
      submitButtonLabel: "Send inquiry",
      successMessage: "Thanks. We received your inquiry and will follow up soon."
    }
  });

  const inquiryFieldCount = await prisma.formField.count({ where: { formId: inquiryForm.id } });
  if (!inquiryFieldCount) {
    await prisma.formField.createMany({
      data: [
        {
          formId: inquiryForm.id,
          label: "Name",
          type: FormFieldType.TEXT,
          fieldRole: FormFieldRole.SUBMITTER_NAME,
          isRequired: true,
          sortOrder: 10
        },
        {
          formId: inquiryForm.id,
          label: "Email",
          type: FormFieldType.EMAIL,
          fieldRole: FormFieldRole.SUBMITTER_EMAIL,
          isRequired: true,
          sortOrder: 20
        },
        { formId: inquiryForm.id, label: "Phone", type: FormFieldType.PHONE, sortOrder: 30 },
        {
          formId: inquiryForm.id,
          label: "What are you interested in?",
          type: FormFieldType.SELECT,
          options: ["Consultation", "Project quote", "Event or class", "Other"],
          isRequired: true,
          sortOrder: 40
        },
        { formId: inquiryForm.id, label: "Message", type: FormFieldType.TEXTAREA, isRequired: true, sortOrder: 50 }
      ]
    });
  }

  const intakeForm = await prisma.form.upsert({
    where: { siteId_slug: { siteId: settings.siteId, slug: "booking-intake" } },
    update: {
      status: FormStatus.ACTIVE,
      destination: FormDestination.BOOKING
    },
    create: {
      siteId: settings.siteId,
      slug: "booking-intake",
      name: "Booking intake",
      description: "Starter intake questions that can attach to a booking workflow later.",
      status: FormStatus.ACTIVE,
      destination: FormDestination.BOOKING,
      submitButtonLabel: "Submit intake",
      successMessage: "Thanks. Your intake details were saved."
    }
  });

  const intakeFieldCount = await prisma.formField.count({ where: { formId: intakeForm.id } });
  if (!intakeFieldCount) {
    await prisma.formField.createMany({
      data: [
        { formId: intakeForm.id, label: "Appointment goal", type: FormFieldType.TEXTAREA, isRequired: true, sortOrder: 10 },
        {
          formId: intakeForm.id,
          label: "Preferred follow-up",
          type: FormFieldType.RADIO,
          options: ["Email", "Phone", "Text"],
          isRequired: true,
          sortOrder: 20
        },
        { formId: intakeForm.id, label: "Target date", type: FormFieldType.DATE, sortOrder: 30 },
        {
          formId: intakeForm.id,
          label: "Signature",
          type: FormFieldType.SIGNATURE,
          fieldRole: FormFieldRole.SUBMITTER_NAME,
          isRequired: true,
          sortOrder: 40
        }
      ]
    });
  }

  await prisma.testimonial.upsert({
    where: { id: "seed-testimonial-1" },
    update: {
      status: TestimonialStatus.APPROVED,
      featured: true,
      permissionGranted: true
    },
    create: {
      id: "seed-testimonial-1",
      siteId: settings.siteId,
      authorName: "Jordan Lee",
      authorRole: "Studio client",
      quote: "The booking flow felt simple, and the follow-up was organized from the first request.",
      rating: 5,
      source: "first-party",
      serviceName: "Consultation",
      permissionGranted: true,
      status: TestimonialStatus.APPROVED,
      featured: true
    }
  });

  console.log(`Starter forms: ${inquiryForm.name}, ${intakeForm.name}`);

  const starterGallery = await prisma.portfolioGallery.upsert({
    where: { siteId_slug: { siteId: settings.siteId, slug: "starter-portfolio" } },
    update: {
      status: PortfolioGalleryStatus.PUBLISHED,
      visibility: PortfolioGalleryVisibility.PUBLIC
    },
    create: {
      siteId: settings.siteId,
      slug: "starter-portfolio",
      title: "Starter Portfolio",
      description: "A sample gallery for auditing portfolio layout, proofing records, and gallery access.",
      status: PortfolioGalleryStatus.PUBLISHED,
      visibility: PortfolioGalleryVisibility.PUBLIC,
      category: "Featured",
      coverImageUrl: "/hero.svg",
      location: "Sample studio",
      seoTitle: "Starter Portfolio",
      seoDescription: "Sample photography portfolio gallery.",
      proofingEnabled: true,
      downloadEnabled: false,
      rightsNotes: "Sample image records only.",
      sortOrder: 10,
      publishedAt: new Date()
    }
  });

  await prisma.portfolioGalleryItem.upsert({
    where: { id: "seed-portfolio-item-1" },
    update: {
      galleryId: starterGallery.id,
      imageUrl: "/hero.svg",
      thumbnailUrl: "/hero.svg",
      isCover: true
    },
    create: {
      id: "seed-portfolio-item-1",
      galleryId: starterGallery.id,
      type: PortfolioItemType.IMAGE,
      title: "Starter image",
      caption: "Sample cover image for the portfolio module.",
      altText: "Neutral sample portfolio image",
      imageUrl: "/hero.svg",
      thumbnailUrl: "/hero.svg",
      sortOrder: 10,
      isCover: true,
      isWatermarked: true,
      licenseNotes: "Internal sample asset."
    }
  });

  await prisma.portfolioGalleryAccess.upsert({
    where: { siteId_accessToken: { siteId: settings.siteId, accessToken: "seed-gallery-access" } },
    update: {
      galleryId: starterGallery.id,
      recipientEmail: "client@example.com"
    },
    create: {
      siteId: settings.siteId,
      galleryId: starterGallery.id,
      recipientEmail: "client@example.com",
      accessToken: "seed-gallery-access"
    }
  });

  await prisma.analyticsGoal.upsert({
    where: { siteId_key: { siteId: settings.siteId, key: "booking-completions" } },
    update: {
      isActive: true
    },
    create: {
      siteId: settings.siteId,
      key: "booking-completions",
      name: "Booking completions",
      eventType: AnalyticsEventType.BOOKING_COMPLETED,
      eventName: "booking completed",
      targetCount: 10,
      isActive: true
    }
  });

  await prisma.analyticsEvent.upsert({
    where: { id: "seed-analytics-event-gallery-view" },
    update: {
      eventType: AnalyticsEventType.GALLERY_VIEWED,
      eventName: "gallery viewed",
      pathname: "/portfolio/starter-portfolio",
      relatedType: "portfolio_gallery",
      relatedId: starterGallery.id
    },
    create: {
      id: "seed-analytics-event-gallery-view",
      siteId: settings.siteId,
      eventType: AnalyticsEventType.GALLERY_VIEWED,
      eventName: "gallery viewed",
      source: "direct",
      medium: "seed",
      pathname: "/portfolio/starter-portfolio",
      relatedType: "portfolio_gallery",
      relatedId: starterGallery.id,
      metadata: { gallerySlug: starterGallery.slug }
    }
  });

  console.log(`Starter portfolio and analytics: ${starterGallery.title}`);

  await prisma.messageTemplate.upsert({
    where: { id: "seed-message-template-booking-confirmation" },
    update: {
      isActive: true
    },
    create: {
      id: "seed-message-template-booking-confirmation",
      siteId: settings.siteId,
      name: "Booking confirmation",
      purpose: MessageTemplatePurpose.BOOKING_CONFIRMATION,
      channel: MessageChannel.EMAIL,
      subject: "{{businessName}} appointment request",
      body: "Thanks, {{customerName}}. Your {{serviceName}} appointment request was received for {{appointmentTime}}.",
      tokens: ["businessName", "customerName", "serviceName", "appointmentTime"],
      isActive: true
    }
  });

  const starterBillingDocument = await prisma.billingDocument.upsert({
    where: { siteId_documentNumber: { siteId: settings.siteId, documentNumber: "INV-SEED-0001" } },
    update: {
      status: BillingDocumentStatus.DRAFT,
      subtotalCents: 12500,
      totalCents: 12500
    },
    create: {
      siteId: settings.siteId,
      documentNumber: "INV-SEED-0001",
      type: BillingDocumentType.INVOICE,
      status: BillingDocumentStatus.DRAFT,
      customerName: "Sample Client",
      customerEmail: "client@example.com",
      currency: "USD",
      subtotalCents: 12500,
      totalCents: 12500,
      publicMemo: "Starter invoice for auditing the billing module."
    }
  });

  await prisma.billingLineItem.upsert({
    where: { id: "seed-billing-line-1" },
    update: {
      billingDocumentId: starterBillingDocument.id,
      description: "Starter package deposit",
      quantity: 1,
      unitPriceCents: 12500,
      lineTotalCents: 12500
    },
    create: {
      id: "seed-billing-line-1",
      billingDocumentId: starterBillingDocument.id,
      description: "Starter package deposit",
      quantity: 1,
      unitPriceCents: 12500,
      lineTotalCents: 12500,
      sortOrder: 10
    }
  });

  await prisma.automation.upsert({
    where: { id: "seed-automation-form-admin-notice" },
    update: {
      status: AutomationStatus.DRAFT
    },
    create: {
      id: "seed-automation-form-admin-notice",
      siteId: settings.siteId,
      name: "Notify admin on form submission",
      status: AutomationStatus.DRAFT,
      trigger: AutomationTrigger.FORM_SUBMITTED,
      action: AutomationAction.NOTIFY_ADMIN,
      targetEmail: email,
      subjectTemplate: "New form submission",
      bodyTemplate: "A public form was submitted. Review the Forms module for details.",
      conditions: { formSlug: "contact-inquiry" }
    }
  });

  const starterWebhook = await prisma.webhookEndpoint.upsert({
    where: { id: "seed-webhook-endpoint" },
    update: {
      status: AutomationStatus.DRAFT
    },
    create: {
      id: "seed-webhook-endpoint",
      siteId: settings.siteId,
      name: "Starter outbound webhook",
      url: "https://example.com/showrunner-webhook",
      signingSecret: generateSigningSecret(),
      status: AutomationStatus.DRAFT,
      events: ["form.submitted", "order.paid"]
    }
  });

  if (!starterWebhook.signingSecret || starterWebhook.signingSecret === "replace-before-production") {
    await prisma.webhookEndpoint.update({
      where: { id: starterWebhook.id },
      data: { signingSecret: generateSigningSecret() }
    });
  }

  console.log("Starter operational modules: communications, billing, automation.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
