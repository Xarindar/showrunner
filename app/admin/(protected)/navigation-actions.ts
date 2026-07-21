"use server";

import { recordAuditLog } from "@/lib/audit";
import { saveAdminModuleNavigationLayout } from "@/lib/admin-navigation";
import { requireAuthenticatedAdmin } from "@/lib/auth";
import { resolveCurrentSite } from "@/lib/site";
import type { AdminModuleNavigationLayoutItem } from "@/shell/module-navigation";

export async function saveAdminModuleNavigationAction(layout: AdminModuleNavigationLayoutItem[]) {
  const [user, site] = await Promise.all([requireAuthenticatedAdmin(), resolveCurrentSite()]);
  const savedLayout = await saveAdminModuleNavigationLayout(user.id, layout);

  await recordAuditLog({
    action: "admin.navigation.updated",
    actor: user,
    metadata: { layout: savedLayout },
    siteId: site.id,
    targetId: user.id,
    targetLabel: user.email,
    targetType: "admin_user"
  });

  return savedLayout;
}
