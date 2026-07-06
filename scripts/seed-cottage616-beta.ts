import "dotenv/config";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { AdminRole, MediaDriver, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEFAULT_SITE_ID, DEFAULT_SITE_SLUG, DEFAULT_TENANT_ID, DEFAULT_TENANT_SLUG } from "../lib/site-boundary";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/showrunner"
});
const prisma = new PrismaClient({ adapter });

const enabledModules = ["dashboard", "content", "appointments", "clients", "scheduling", "settings", "users", "help"];
const knownModules = [
  "dashboard",
  "content",
  "appointments",
  "clients",
  "scheduling",
  "media",
  "portfolio",
  "forms",
  "testimonials",
  "settings",
  "users",
  "deployments",
  "help",
  "products",
  "payments",
  "communications",
  "billing",
  "automation",
  "analytics"
];
const bookingOrigins = [
  "https://cottage616.com",
  "https://www.cottage616.com",
  "https://xarindar.com",
  "https://cottage616-production.up.railway.app"
];

function publicKey() {
  return `pk_live_${randomBytes(24).toString("base64url")}`;
}

async function seedModuleEnablement(siteId: string) {
  const enabled = new Set(enabledModules);
  await prisma.$transaction(
    knownModules.map((moduleId) =>
      prisma.moduleInstallation.upsert({
        where: { siteId_moduleId: { siteId, moduleId } },
        update: { installed: true, enabled: enabled.has(moduleId) },
        create: { siteId, moduleId, installed: true, enabled: enabled.has(moduleId) }
      })
    )
  );
}

async function seedAvailability(siteId: string) {
  await prisma.availabilityRule.deleteMany({
    where: {
      siteId,
      OR: [{ staffId: null, resourceId: null }, { staffId: "cottage616-staff-team" }, { resourceId: "cottage616-main-space" }]
    }
  });

  const weekdays = [1, 2, 3, 4, 5, 6];
  await prisma.availabilityRule.createMany({
    data: weekdays.flatMap((weekday) => [
      { siteId, weekday, startMinutes: 10 * 60, endMinutes: 18 * 60 },
      { siteId, weekday, staffId: "cottage616-staff-team", startMinutes: 10 * 60, endMinutes: 18 * 60 },
      { siteId, weekday, resourceId: "cottage616-main-space", startMinutes: 10 * 60, endMinutes: 18 * 60 }
    ])
  });
}

async function seedServices(siteId: string) {
  await prisma.service.updateMany({
    where: { siteId, id: { startsWith: "seed-" } },
    data: { isActive: false }
  });

  const resource = await prisma.resource.upsert({
    where: { id: "cottage616-main-space" },
    update: {
      isActive: true,
      location: "3773 County Road 616, Bay, AR 72411",
      name: "Cottage 616",
      type: "VENUE"
    },
    create: {
      id: "cottage616-main-space",
      siteId,
      capacity: 1,
      description: "Primary Cottage 616 booking space.",
      isActive: true,
      location: "3773 County Road 616, Bay, AR 72411",
      name: "Cottage 616",
      type: "VENUE"
    }
  });

  const staff = await prisma.staffMember.upsert({
    where: { id: "cottage616-staff-team" },
    update: {
      email: "info@cottage616.com",
      isActive: true,
      name: "Cottage 616 Team",
      phone: "(870) 219-6982",
      title: "Booking team"
    },
    create: {
      id: "cottage616-staff-team",
      siteId,
      email: "info@cottage616.com",
      isActive: true,
      name: "Cottage 616 Team",
      phone: "(870) 219-6982",
      title: "Booking team"
    }
  });

  const services = [
    {
      id: "cottage616-birthday-party",
      slug: "birthday-party",
      name: "Birthday Party",
      category: "events",
      description: "Placeholder party booking for Cottage 616 celebrations.",
      durationMinutes: 180,
      requestOnly: true,
      intakePrompt: "Tell us the date, guest count, celebration style, and any setup notes."
    },
    {
      id: "cottage616-baby-shower",
      slug: "baby-shower",
      name: "Baby Shower",
      category: "events",
      description: "Placeholder shower booking for family celebrations.",
      durationMinutes: 180,
      requestOnly: true,
      intakePrompt: "Share your preferred date, guest count, colors, and vendor needs."
    },
    {
      id: "cottage616-intimate-wedding",
      slug: "intimate-wedding",
      name: "Intimate Wedding",
      category: "events",
      description: "Placeholder wedding inquiry for small gatherings.",
      durationMinutes: 240,
      requestOnly: true,
      intakePrompt: "Share your date range, ceremony size, reception plan, and must-haves."
    },
    {
      id: "cottage616-head-spa",
      slug: "head-spa",
      name: "Head Spa",
      category: "the-hive",
      description: "Placeholder Hive head-spa appointment.",
      durationMinutes: 75,
      requestOnly: false,
      intakePrompt: "Tell us about any scalp sensitivities, hair extensions, or comfort notes."
    }
  ];

  for (const service of services) {
    await prisma.service.upsert({
      where: { id: service.id },
      update: {
        ...service,
        bufferAfterMinutes: 15,
        bufferBeforeMinutes: 15,
        isActive: true,
        location: "Cottage 616",
        maxAdvanceDays: 180,
        minimumNoticeHours: 24,
        policyText: "Requests are subject to Cottage 616 confirmation. The team will follow up if details need to be adjusted.",
        requirePolicy: true,
        siteId,
        slotIntervalMinutes: 30,
        waitlistEnabled: true
      },
      create: {
        ...service,
        siteId,
        bufferAfterMinutes: 15,
        bufferBeforeMinutes: 15,
        isActive: true,
        location: "Cottage 616",
        maxAdvanceDays: 180,
        minimumNoticeHours: 24,
        policyText: "Requests are subject to Cottage 616 confirmation. The team will follow up if details need to be adjusted.",
        requirePolicy: true,
        slotIntervalMinutes: 30,
        waitlistEnabled: true
      }
    });

    await prisma.serviceStaff.upsert({
      where: { serviceId_staffId: { serviceId: service.id, staffId: staff.id } },
      update: {},
      create: { serviceId: service.id, siteId, staffId: staff.id }
    });
    await prisma.serviceResource.upsert({
      where: { serviceId_resourceId: { serviceId: service.id, resourceId: resource.id } },
      update: {},
      create: { serviceId: service.id, siteId, resourceId: resource.id }
    });
  }
}

async function seedBookingKey(siteId: string) {
  const existing = await prisma.siteApiKey.findFirst({
    where: { siteId, name: "Cottage616 public booking" },
    orderBy: { createdAt: "desc" }
  });

  if (existing) {
    const updated = await prisma.siteApiKey.update({
      where: { id: existing.id },
      data: {
        allowedOrigins: bookingOrigins,
        enabled: true,
        revokedAt: null,
        scopes: ["scheduling:read", "scheduling:write"]
      }
    });
    return updated.publicKey;
  }

  const created = await prisma.siteApiKey.create({
    data: {
      siteId,
      name: "Cottage616 public booking",
      publicKey: publicKey(),
      allowedOrigins: bookingOrigins,
      scopes: ["scheduling:read", "scheduling:write"]
    }
  });
  return created.publicKey;
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@cottage616.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "";

  await prisma.tenant.upsert({
    where: { id: DEFAULT_TENANT_ID },
    update: { name: "Cottage 616" },
    create: { id: DEFAULT_TENANT_ID, slug: DEFAULT_TENANT_SLUG, name: "Cottage 616" }
  });
  await prisma.site.upsert({
    where: { id: DEFAULT_SITE_ID },
    update: { name: "Cottage 616", slug: DEFAULT_SITE_SLUG, isDefault: true },
    create: { id: DEFAULT_SITE_ID, tenantId: DEFAULT_TENANT_ID, slug: DEFAULT_SITE_SLUG, name: "Cottage 616", isDefault: true }
  });
  const settings = await prisma.siteSettings.upsert({
    where: { siteId: DEFAULT_SITE_ID },
    update: {
      businessName: "Cottage 616",
      contactEmail: "info@cottage616.com",
      enabledModules,
      heroHeadline: "Book Cottage 616",
      heroSubheadline: "Request celebrations, showers, intimate weddings, and Hive head-spa appointments.",
      introBody: "A placeholder beta setup for managing services, clients, appointments, and content.",
      introTitle: "Cottage 616 beta",
      mediaDriver: MediaDriver.S3,
      timezone: "America/Chicago"
    },
    create: {
      id: DEFAULT_SITE_ID,
      siteId: DEFAULT_SITE_ID,
      businessName: "Cottage 616",
      contactEmail: "info@cottage616.com",
      enabledModules,
      heroHeadline: "Book Cottage 616",
      heroSubheadline: "Request celebrations, showers, intimate weddings, and Hive head-spa appointments.",
      introBody: "A placeholder beta setup for managing services, clients, appointments, and content.",
      introTitle: "Cottage 616 beta",
      mediaDriver: MediaDriver.S3,
      themePreset: "clean",
      timezone: "America/Chicago"
    }
  });

  if (adminPassword) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.adminUser.upsert({
      where: { email: adminEmail },
      update: { passwordHash, role: AdminRole.OWNER },
      create: { email: adminEmail, passwordHash, role: AdminRole.OWNER }
    });
  }

  await seedModuleEnablement(settings.siteId);
  await seedServices(settings.siteId);
  await seedAvailability(settings.siteId);
  const key = await seedBookingKey(settings.siteId);

  console.log(`COTTAGE616_PUBLIC_BOOKING_KEY=${key}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
