import "dotenv/config";
import { BookingStatus, BookingWaitlistStatus, ClientPipelineStage, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEFAULT_SITE_ID } from "../lib/site-boundary";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/showrunner"
});
const prisma = new PrismaClient({ adapter });

const demoBookingPrefix = "demo-appointment-";
const demoWaitlistPrefix = "demo-waitlist-";

type CalendarDate = {
  day: number;
  month: number;
  year: number;
};

const clientFixtures = [
  ["Avery Stone", "avery.stone", "312-555-0101", "Stone & Finch"],
  ["Noah Williams", "noah.williams", "312-555-0102", ""],
  ["Maya Chen", "maya.chen", "312-555-0103", "Maya Chen Creative"],
  ["Jordan Lee", "jordan.lee", "312-555-0104", "Northline Studio"],
  ["Elena Garcia", "elena.garcia", "312-555-0105", ""],
  ["Theo Martin", "theo.martin", "312-555-0106", "Martin Family"],
  ["Priya Shah", "priya.shah", "312-555-0107", "Lumen Events"],
  ["Miles Bennett", "miles.bennett", "312-555-0108", ""],
  ["Camille Foster", "camille.foster", "312-555-0109", "Foster House"],
  ["Owen Brooks", "owen.brooks", "312-555-0110", ""],
  ["Sofia Rivera", "sofia.rivera", "312-555-0111", "Sofia Rivera Design"],
  ["Elliot Kim", "elliot.kim", "312-555-0112", ""],
  ["Amara Johnson", "amara.johnson", "312-555-0113", "Juniper & Co."],
  ["Henry Davis", "henry.davis", "312-555-0114", ""],
  ["Zoe Campbell", "zoe.campbell", "312-555-0115", "Campbell Collective"],
  ["Lucas Reed", "lucas.reed", "312-555-0116", ""],
  ["Nora Thompson", "nora.thompson", "312-555-0117", "Thompson Family"],
  ["Isaac Moore", "isaac.moore", "312-555-0118", ""],
  ["Leila Patel", "leila.patel", "312-555-0119", "Marigold Paper"],
  ["Caleb Turner", "caleb.turner", "312-555-0120", ""],
  ["Grace Nguyen", "grace.nguyen", "312-555-0121", "Grace Nguyen Photo"],
  ["Sam Wilson", "sam.wilson", "312-555-0122", ""],
  ["Ruby Anderson", "ruby.anderson", "312-555-0123", "Ruby A. Interiors"],
  ["Finn Carter", "finn.carter", "312-555-0124", ""]
] as const;

const serviceFixtures = [
  {
    description: "A short planning call to confirm details before the main appointment.",
    durationMinutes: 30,
    id: "seed-service-prep-call",
    location: "Phone",
    name: "Prep Call",
    slug: "prep-call"
  },
  {
    description: "A focused appointment to understand the project and next steps.",
    durationMinutes: 45,
    id: "seed-consultation",
    location: "Studio A or online",
    name: "Consultation",
    slug: "consultation"
  },
  {
    description: "Review proofs, selections, or creative direction.",
    durationMinutes: 60,
    id: "seed-service-proof-review",
    location: "Studio A",
    name: "Proof Review",
    slug: "proof-review"
  },
  {
    description: "A longer hands-on appointment in the studio.",
    durationMinutes: 90,
    id: "seed-service-studio-session",
    location: "Studio A",
    name: "Studio Session",
    slug: "studio-session"
  },
  {
    description: "Long-form planning for packages, albums, and follow-up work.",
    durationMinutes: 120,
    id: "seed-service-design-session",
    location: "Studio A",
    name: "Design Session",
    slug: "design-session"
  }
] as const;

const staffFixtures = [
  {
    bio: "Guides clients through planning, preparation, and the appointment day.",
    email: "mara@example.com",
    id: "seed-staff-mara-chen",
    name: "Mara Chen",
    phone: "312-555-0198",
    title: "Client lead"
  },
  {
    bio: "Leads studio appointments and proof reviews.",
    email: "julian@example.com",
    id: "demo-staff-julian-park",
    name: "Julian Park",
    phone: "312-555-0197",
    title: "Studio specialist"
  },
  {
    bio: "Coordinates consultations, design sessions, and client follow-up.",
    email: "nia@example.com",
    id: "demo-staff-nia-brooks",
    name: "Nia Brooks",
    phone: "312-555-0196",
    title: "Planning specialist"
  }
] as const;

const bookingNotes = [
  "First visit. Review goals and leave time for questions.",
  "Returning client; preferences are saved in the client record.",
  "Requested a quiet arrival and a few minutes to settle in.",
  "Confirm final selections before the appointment wraps.",
  "Bringing a collaborator; prepare seating for two.",
  "Follow up with a concise recap and next steps.",
  "Client is flexible if an earlier opening becomes available.",
  "Review inspiration notes at the beginning of the appointment."
] as const;

function dateKey(date: CalendarDate) {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function calendarDateFromDate(date: Date): CalendarDate {
  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear()
  };
}

function addCalendarDays(date: CalendarDate, days: number) {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return calendarDateFromDate(shifted);
}

function compareCalendarDates(left: CalendarDate, right: CalendarDate) {
  return dateKey(left).localeCompare(dateKey(right));
}

function weekday(date: CalendarDate) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

function currentCalendarDate(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    day: Number(values.day),
    month: Number(values.month),
    year: Number(values.year)
  };
}

function zonedTimeToUtc(date: CalendarDate, hour: number, minute: number, timeZone: string) {
  const guess = new Date(Date.UTC(date.year, date.month - 1, date.day, hour, minute));
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric"
  });

  const offsetAt = (candidate: Date) => {
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map((part) => [part.type, part.value]));
    const localAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    return localAsUtc - candidate.getTime();
  };

  const firstPass = new Date(guess.getTime() - offsetAt(guess));
  return new Date(guess.getTime() - offsetAt(firstPass));
}

function statusFor(date: CalendarDate, today: CalendarDate, sequence: number) {
  const comparison = compareCalendarDates(date, today);

  if (comparison < 0) {
    if (sequence % 11 === 0) return BookingStatus.CANCELED;
    if (sequence % 7 === 0) return BookingStatus.CONFIRMED;
    return BookingStatus.COMPLETED;
  }

  if (comparison === 0) {
    return sequence % 4 === 0 ? BookingStatus.PENDING : BookingStatus.CONFIRMED;
  }

  if (sequence % 13 === 0) return BookingStatus.CANCELED;
  if (sequence % 6 === 0) return BookingStatus.PENDING;
  return BookingStatus.CONFIRMED;
}

async function main() {
  const site = await prisma.site.findUnique({
    where: { id: DEFAULT_SITE_ID },
    include: { settings: true }
  });
  if (!site) throw new Error(`Site "${DEFAULT_SITE_ID}" was not found. Run npm run seed first.`);

  const siteId = site.id;
  const timeZone = site.settings?.timezone || "America/Chicago";
  const today = currentCalendarDate(timeZone);
  const rangeStart = addCalendarDays(today, -14);
  const rangeEnd = addCalendarDays(today, 28);

  const studio = await prisma.resource.upsert({
    where: { id: "seed-studio-a" },
    update: {
      capacity: 2,
      description: "Primary room for demo consultations, reviews, and studio appointments.",
      isActive: true,
      location: "Main studio",
      name: "Studio A",
      type: "ROOM"
    },
    create: {
      capacity: 2,
      description: "Primary room for demo consultations, reviews, and studio appointments.",
      id: "seed-studio-a",
      isActive: true,
      location: "Main studio",
      name: "Studio A",
      siteId,
      type: "ROOM"
    }
  });

  const services = await Promise.all(
    serviceFixtures.map((fixture) =>
      prisma.service.upsert({
        where: { id: fixture.id },
        update: {
          description: fixture.description,
          durationMinutes: fixture.durationMinutes,
          isActive: true,
          location: fixture.location,
          name: fixture.name,
          slug: fixture.slug,
          waitlistEnabled: true
        },
        create: {
          ...fixture,
          isActive: true,
          siteId,
          waitlistEnabled: true
        }
      })
    )
  );

  const staff = await Promise.all(
    staffFixtures.map((fixture) =>
      prisma.staffMember.upsert({
        where: { id: fixture.id },
        update: { ...fixture, isActive: true },
        create: { ...fixture, isActive: true, siteId }
      })
    )
  );

  for (const service of services) {
    await prisma.serviceResource.upsert({
      where: { serviceId_resourceId: { resourceId: studio.id, serviceId: service.id } },
      update: {},
      create: { resourceId: studio.id, serviceId: service.id, siteId }
    });

    for (const staffMember of staff) {
      await prisma.serviceStaff.upsert({
        where: { serviceId_staffId: { serviceId: service.id, staffId: staffMember.id } },
        update: {},
        create: { serviceId: service.id, siteId, staffId: staffMember.id }
      });
    }
  }

  for (const staffMember of staff) {
    const availabilityCount = await prisma.availabilityRule.count({
      where: { siteId, staffId: staffMember.id }
    });
    if (!availabilityCount) {
      await prisma.availabilityRule.createMany({
        data: [1, 2, 3, 4, 5, 6].map((day) => ({
          endMinutes: day === 6 ? 14 * 60 : 18 * 60,
          siteId,
          staffId: staffMember.id,
          startMinutes: day === 6 ? 9 * 60 : 8 * 60,
          weekday: day
        }))
      });
    }
  }

  const clients = await Promise.all(
    clientFixtures.map(([name, emailStem, phone, companyName], index) =>
      prisma.client.upsert({
        where: { siteId_email: { email: `demo.appointment+${emailStem}@example.com`, siteId } },
        update: {
          companyName,
          name,
          phone,
          pipelineStage: index % 5 === 0 ? ClientPipelineStage.FOLLOW_UP : ClientPipelineStage.BOOKED,
          privateNotes: "Faux client generated for populated appointment and dashboard previews.",
          status: index % 5 === 0 ? "follow_up" : "appointment_booked",
          timezone: timeZone
        },
        create: {
          city: "Chicago",
          companyName,
          country: "US",
          email: `demo.appointment+${emailStem}@example.com`,
          emailOptIn: index % 3 !== 0,
          id: `demo-client-${emailStem.replaceAll(".", "-")}`,
          name,
          phone,
          pipelineStage: index % 5 === 0 ? ClientPipelineStage.FOLLOW_UP : ClientPipelineStage.BOOKED,
          policyAcceptanceHistory: [{ acceptedAt: new Date().toISOString(), source: "demo-appointment-seed" }],
          privateNotes: "Faux client generated for populated appointment and dashboard previews.",
          region: "IL",
          siteId,
          smsOptIn: index % 4 !== 0,
          status: index % 5 === 0 ? "follow_up" : "appointment_booked",
          timezone: timeZone
        }
      })
    )
  );

  await prisma.bookingWaitlistEntry.deleteMany({
    where: { siteId, id: { startsWith: demoWaitlistPrefix } }
  });
  await prisma.booking.deleteMany({
    where: { siteId, id: { startsWith: demoBookingPrefix } }
  });

  const weekdaySlots = [
    [8, 30],
    [10, 0],
    [11, 30],
    [13, 30]
  ] as const;
  const saturdaySlots = [
    [9, 0],
    [11, 0]
  ] as const;
  const todaySlots = [
    [8, 30],
    [10, 0],
    [11, 30],
    [13, 30],
    [15, 30]
  ] as const;

  const statusCounts = new Map<BookingStatus, number>();
  let bookingSequence = 0;
  let cursor = rangeStart;

  while (compareCalendarDates(cursor, rangeEnd) <= 0) {
    const day = weekday(cursor);
    const isToday = compareCalendarDates(cursor, today) === 0;
    const slots = isToday ? todaySlots : day >= 1 && day <= 5 ? weekdaySlots : day === 6 ? saturdaySlots : [];

    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const [hour, minute] = slots[slotIndex];
      const service = services[(bookingSequence * 3 + slotIndex) % services.length];
      const client = clients[(bookingSequence * 5 + day) % clients.length];
      const staffMember = staff[(bookingSequence + slotIndex) % staff.length];
      const startsAt = zonedTimeToUtc(cursor, hour, minute, timeZone);
      const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
      const status = statusFor(cursor, today, bookingSequence);
      const id = `${demoBookingPrefix}${dateKey(cursor)}-${String(slotIndex + 1).padStart(2, "0")}`;

      await prisma.booking.create({
        data: {
          adminNotes: "Rolling faux appointment generated by npm run seed:demo-appointments.",
          cancellationReason: status === BookingStatus.CANCELED ? "Schedule changed; client will rebook." : null,
          clientId: client.id,
          createdAt: new Date(startsAt.getTime() - (3 + (bookingSequence % 18)) * 86_400_000),
          customerEmail: client.email,
          customerName: client.name,
          customerPhone: client.phone,
          endsAt,
          id,
          intakeResponse: "Looking for a clear plan, an easy appointment, and guidance on the next step.",
          notes: bookingNotes[bookingSequence % bookingNotes.length],
          policyAccepted: true,
          resources: {
            create: {
              resourceId: studio.id,
              siteId
            }
          },
          serviceId: service.id,
          siteId,
          staffId: staffMember.id,
          startsAt,
          status
        }
      });

      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
      bookingSequence += 1;
    }

    cursor = addCalendarDays(cursor, 1);
  }

  const waitlistDates = [3, 5, 8, 12].map((offset) => addCalendarDays(today, offset));
  for (let index = 0; index < waitlistDates.length; index += 1) {
    const date = waitlistDates[index];
    const client = clients[(index * 7 + 2) % clients.length];
    const service = services[(index + 1) % services.length];
    const staffMember = staff[index % staff.length];

    await prisma.bookingWaitlistEntry.create({
      data: {
        customerEmail: client.email,
        customerName: client.name,
        customerPhone: client.phone,
        id: `${demoWaitlistPrefix}${index + 1}`,
        intakeResponse: "Please contact me if an earlier opening becomes available.",
        notes: "Flexible by about an hour in either direction.",
        policyAccepted: true,
        serviceId: service.id,
        siteId,
        staffId: staffMember.id,
        startsAt: zonedTimeToUtc(date, 10 + index, 0, timeZone),
        status: BookingWaitlistStatus.WAITING
      }
    });
  }

  const statusSummary = Object.values(BookingStatus)
    .map((status) => `${status.toLowerCase()}: ${statusCounts.get(status) || 0}`)
    .join(", ");

  console.log(
    `Seeded ${bookingSequence} faux appointments from ${dateKey(rangeStart)} through ${dateKey(rangeEnd)} (${statusSummary}).`
  );
  console.log(`Seeded ${clients.length} faux clients, ${staff.length} staff, and ${waitlistDates.length} waitlist entries.`);
  console.log(`Today's ${dateKey(today)} dashboard queue contains ${todaySlots.length} appointments.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
