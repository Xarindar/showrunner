import { BookingReminderStatus, BookingStatus, EmailCategory, Prisma } from "@prisma/client";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { queueEmail } from "@/lib/email/queue";
import { getSiteSettingsForSite } from "@/lib/site";
import type { EmailTokens } from "@/lib/email/types";

const DEFAULT_REMINDER_LEAD_MINUTES = 24 * 60;
const MAX_BOOKINGS_PER_SITE = 100;
const CLAIM_STALE_MINUTES = 15;
const MAX_REMINDER_ATTEMPTS = 3;

type ReminderBooking = {
  id: string;
  siteId: string;
  customerName: string;
  customerEmail: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  service: {
    name: string;
  };
};

export type BookingReminderSweepResult = {
  sitesChecked: number;
  bookingsChecked: number;
  queued: number;
  skipped: number;
  failed: number;
};

function endTime(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en", {
    timeStyle: "short",
    timeZone
  }).format(value);
}

function appointmentTime(booking: ReminderBooking, timeZone: string) {
  return `${formatDateTime(booking.startsAt, timeZone)} - ${endTime(booking.endsAt, timeZone)}`;
}

async function reminderTokens(booking: ReminderBooking): Promise<EmailTokens> {
  const settings = await getSiteSettingsForSite(booking.siteId);

  return {
    businessName: settings.businessName,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    serviceName: booking.service.name,
    appointmentStartsAt: booking.startsAt,
    appointmentEndsAt: booking.endsAt,
    appointmentTime: appointmentTime(booking, settings.timezone),
    timezone: settings.timezone,
    bookingStatus: booking.status
  };
}

async function queueBookingReminderEmail(booking: ReminderBooking, leadMinutes: number) {
  await queueEmail({
    siteId: booking.siteId,
    templateKey: "booking.reminder.customer",
    recipientEmail: booking.customerEmail,
    recipientName: booking.customerName,
    category: EmailCategory.TRANSACTIONAL,
    relatedType: "booking",
    relatedId: booking.id,
    tokens: await reminderTokens(booking),
    idempotencyKey: `booking:${booking.id}:reminder:customer`
  });

  await prisma.bookingReminder.update({
    where: { bookingId: booking.id },
    data: {
      leadMinutes,
      queuedAt: new Date(),
      status: BookingReminderStatus.QUEUED,
      lastError: ""
    }
  });
}

function cleanError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000);
}

async function claimReminder(booking: ReminderBooking, leadMinutes: number, now: Date) {
  const scheduledFor = new Date(booking.startsAt.getTime() - leadMinutes * 60 * 1000);
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MINUTES * 60 * 1000);

  try {
    await prisma.bookingReminder.create({
      data: {
        siteId: booking.siteId,
        bookingId: booking.id,
        leadMinutes,
        scheduledFor,
        status: BookingReminderStatus.CLAIMED,
        claimedAt: now,
        attemptCount: 1
      }
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const reclaimed = await prisma.bookingReminder.updateMany({
        where: {
          bookingId: booking.id,
          attemptCount: { lt: MAX_REMINDER_ATTEMPTS },
          OR: [
            {
              status: BookingReminderStatus.CLAIMED,
              claimedAt: { lt: staleBefore }
            },
            {
              status: BookingReminderStatus.FAILED,
              OR: [{ failedAt: null }, { failedAt: { lt: staleBefore } }]
            }
          ]
        },
        data: {
          leadMinutes,
          scheduledFor,
          status: BookingReminderStatus.CLAIMED,
          claimedAt: now,
          queuedAt: null,
          failedAt: null,
          lastError: "",
          attemptCount: { increment: 1 }
        }
      });
      return reclaimed.count > 0;
    }
    throw error;
  }
}

async function markReminderFailed(booking: ReminderBooking, leadMinutes: number, error: unknown) {
  await prisma.bookingReminder.upsert({
    where: { bookingId: booking.id },
    update: {
      leadMinutes,
      status: BookingReminderStatus.FAILED,
      failedAt: new Date(),
      lastError: cleanError(error)
    },
    create: {
      siteId: booking.siteId,
      bookingId: booking.id,
      leadMinutes,
      scheduledFor: new Date(booking.startsAt.getTime() - leadMinutes * 60 * 1000),
      status: BookingReminderStatus.FAILED,
      failedAt: new Date(),
      lastError: cleanError(error),
      attemptCount: 1
    }
  });
}

export async function sweepBookingReminders(now = new Date()): Promise<BookingReminderSweepResult> {
  const result: BookingReminderSweepResult = {
    sitesChecked: 0,
    bookingsChecked: 0,
    queued: 0,
    skipped: 0,
    failed: 0
  };
  const sites = await prisma.site.findMany({
    select: {
      id: true,
      schedulingSettings: true
    }
  });

  for (const site of sites) {
    result.sitesChecked += 1;
    const remindersEnabled = site.schedulingSettings?.bookingReminderEnabled ?? true;
    if (!remindersEnabled) continue;

    const leadMinutes = site.schedulingSettings?.bookingReminderLeadMinutes || DEFAULT_REMINDER_LEAD_MINUTES;
    const windowEnd = new Date(now.getTime() + leadMinutes * 60 * 1000);
    const staleBefore = new Date(now.getTime() - CLAIM_STALE_MINUTES * 60 * 1000);
    const bookings = await prisma.booking.findMany({
      where: {
        siteId: site.id,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        startsAt: {
          gt: now,
          lte: windowEnd
        },
        OR: [
          { reminders: { none: {} } },
          {
            reminders: {
              some: {
                status: BookingReminderStatus.CLAIMED,
                claimedAt: { lt: staleBefore },
                attemptCount: { lt: MAX_REMINDER_ATTEMPTS }
              }
            }
          },
          {
            reminders: {
              some: {
                status: BookingReminderStatus.FAILED,
                attemptCount: { lt: MAX_REMINDER_ATTEMPTS },
                OR: [{ failedAt: null }, { failedAt: { lt: staleBefore } }]
              }
            }
          }
        ]
      },
      include: {
        service: { select: { name: true } }
      },
      orderBy: { startsAt: "asc" },
      take: MAX_BOOKINGS_PER_SITE
    });

    result.bookingsChecked += bookings.length;

    for (const booking of bookings) {
      try {
        const claimed = await claimReminder(booking, leadMinutes, now);
        if (!claimed) {
          result.skipped += 1;
          continue;
        }

        await queueBookingReminderEmail(booking, leadMinutes);
        result.queued += 1;
      } catch (error) {
        result.failed += 1;
        await markReminderFailed(booking, leadMinutes, error);
      }
    }
  }

  return result;
}
