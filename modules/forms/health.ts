import "server-only";

import { FormStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { warning, type ModuleHealthCheck } from "@/lib/platform-health";

export const getHealth: ModuleHealthCheck = async () => {
  const warnings = [];
  const activeFormCount = await prisma.form.count({ where: { status: FormStatus.ACTIVE } });

  if (activeFormCount === 0) {
    warnings.push(
      warning("No active forms", "Forms are enabled, but no form is active for public visitors.", "warning", "forms", "/admin/modules/forms")
    );
  }

  return warnings;
};
