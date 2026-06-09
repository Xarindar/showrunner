import "server-only";

import { TestimonialStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { warning, type ModuleHealthCheck } from "@/lib/platform-health";

export const getHealth: ModuleHealthCheck = async () => {
  const warnings = [];
  const pendingTestimonialCount = await prisma.testimonial.count({ where: { status: TestimonialStatus.PENDING } });

  if (pendingTestimonialCount > 0) {
    warnings.push(
      warning(
        "Testimonials waiting",
        `${pendingTestimonialCount} testimonial${pendingTestimonialCount === 1 ? "" : "s"} need moderation.`,
        "info",
        "testimonials",
        "/admin/modules/testimonials"
      )
    );
  }

  return warnings;
};
