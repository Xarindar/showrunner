import Link from "next/link";
import type { Resource, Service, ServiceResource, ServiceStaff, StaffMember } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { nativeSchedulingAdapter } from "@/lib/scheduling/native";
import { themeToCssVars } from "@/lib/theme/tokens";
import { addDaysToDateKey, getTodayDateKey, getZonedWeekday, parseZonedDateKey } from "@/lib/timezone";
import { BookingFlow } from "./booking-flow";

type BookingPageShellProps = {
  initialServiceSlug?: string;
};

type ActiveServiceWithStaff = Service & {
  resourceAssignments: Array<ServiceResource & { resource: Resource }>;
  staffAssignments: Array<ServiceStaff & { staff: StaffMember }>;
};

function getDefaultDate(timeZone: string, availableWeekdays: number[]) {
  const weekdays = new Set(availableWeekdays);
  let dateKey = addDaysToDateKey(getTodayDateKey(timeZone), 1);

  for (let index = 0; index < 14; index += 1) {
    const day = parseZonedDateKey(dateKey, timeZone);
    if (!day || !weekdays.size || weekdays.has(getZonedWeekday(day, timeZone))) {
      return dateKey;
    }

    dateKey = addDaysToDateKey(dateKey, 1);
  }

  return dateKey;
}

export async function BookingPageShell({ initialServiceSlug }: BookingPageShellProps) {
  const settings = await getSiteSettings();
  const [services, availability] = await Promise.all([
    nativeSchedulingAdapter.listActiveServices() as Promise<ActiveServiceWithStaff[]>,
    prisma.availabilityRule.findMany({ where: { siteId: settings.siteId }, select: { weekday: true } })
  ]);

  return (
    <main className="site-shell" style={themeToCssVars(settings)}>
      <nav className="site-nav">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>{settings.businessName}</span>
        </Link>
        <Link href="/admin" className="button secondary">
          Admin
        </Link>
      </nav>

      <section className="booking-page">
        <div className="booking-intro">
          <p className="eyebrow">Booking</p>
          <h1>Find a time that works.</h1>
          <p className="lead">Choose the service, pick an opening, and review everything before the request is sent.</p>
        </div>

        <BookingFlow
          defaultDate={getDefaultDate(
            settings.timezone,
            Array.from(new Set(availability.map((rule) => rule.weekday)))
          )}
          initialServiceSlug={initialServiceSlug}
          services={services.map((service) => ({
            id: service.id,
            slug: service.slug,
            name: service.name,
            description: service.description,
            durationMinutes: service.durationMinutes,
            location: service.location,
            intakePrompt: service.intakePrompt,
            policyText: service.policyText,
            requirePolicy: service.requirePolicy,
            requestOnly: service.requestOnly,
            waitlistEnabled: service.waitlistEnabled,
            resources: service.resourceAssignments
              ? service.resourceAssignments.map((assignment) => ({
                  id: assignment.resource.id,
                  name: assignment.resource.name,
                  type: assignment.resource.type
                }))
              : [],
            staff: service.staffAssignments
              ? service.staffAssignments.map((assignment) => ({
                  id: assignment.staff.id,
                  name: assignment.staff.name,
                  title: assignment.staff.title
                }))
              : []
          }))}
        />
      </section>
    </main>
  );
}
