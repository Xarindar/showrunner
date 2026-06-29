import "server-only";

import { prisma } from "@/lib/prisma";
import { envLooksDefault, warning, type ModuleHealthCheck } from "@/lib/platform-health";

export const getHealth: ModuleHealthCheck = async ({ settings }) => {
  const warnings = [];
  const [activeServiceCount, availabilityRuleCount, resourceAssignmentsWithoutHours] = await Promise.all([
    prisma.service.count({ where: { siteId: settings.siteId, isActive: true } }),
    prisma.availabilityRule.count({ where: { siteId: settings.siteId } }),
    prisma.serviceResource.findMany({
      where: {
        siteId: settings.siteId,
        resource: {
          isActive: true,
          availabilityRules: { none: {} }
        }
      },
      include: { resource: true },
      take: 5
    })
  ]);

  if (activeServiceCount === 0) {
    warnings.push(
      warning(
        "No active services",
        "Public booking has no active service to show until Services has at least one active service.",
        "critical",
        "scheduling",
        "/admin/modules/services"
      )
    );
  }

  if (availabilityRuleCount === 0) {
    warnings.push(
      warning(
        "No weekly availability",
        "The native booking adapter cannot offer slots until at least one availability rule exists.",
        "critical",
        "scheduling",
        "/admin/modules/appointments?panel=rules&tab=availability"
      )
    );
  }

  if (resourceAssignmentsWithoutHours.length) {
    warnings.push(
      warning(
        "Required resources need hours",
        `${resourceAssignmentsWithoutHours.map((assignment) => assignment.resource.name).join(", ")} ${
          resourceAssignmentsWithoutHours.length === 1 ? "is" : "are"
        } required by a service but has no resource availability rules.`,
        "warning",
        "scheduling",
        "/admin/modules/appointments?panel=rules&tab=team"
      )
    );
  }

  if (envLooksDefault(process.env.BOOKING_REMINDER_WORKER_SECRET || process.env.EMAIL_WORKER_SECRET)) {
    warnings.push(
      warning(
        "Booking reminder worker secret needs setup",
        "Set BOOKING_REMINDER_WORKER_SECRET and provision the scheduled reminder sweep (npm run booking-reminders:process) before relying on appointment reminders.",
        "warning",
        "scheduling",
        "/admin/modules/appointments?panel=rules&tab=calendar"
      )
    );
  }

  return warnings;
};
