import type { AdminRole } from "@prisma/client";

export const adminPermissions = [
  "analytics:read",
  "analytics:manage",
  "appointments:manage",
  "automation:manage",
  "billing:manage",
  "clients:export",
  "clients:manage",
  "communications:manage",
  "content:manage",
  "forms:export",
  "forms:manage",
  "media:manage",
  "portfolio:manage",
  "products:manage",
  "orders:manage",
  "scheduling:manage",
  "settings:update",
  "testimonials:manage",
  "users:manage"
] as const;

export type AdminPermission = (typeof adminPermissions)[number];

const rolePermissions: Record<AdminRole, readonly AdminPermission[]> = {
  OWNER: adminPermissions,
  ADMIN: adminPermissions.filter((permission) => permission !== "users:manage"),
  STAFF: ["appointments:manage", "clients:manage", "forms:manage", "testimonials:manage"],
  PHOTOGRAPHER: ["clients:manage", "media:manage", "portfolio:manage"],
  FULFILLMENT: ["media:manage", "portfolio:manage", "products:manage", "orders:manage"],
  ACCOUNTANT: ["analytics:read", "billing:manage", "clients:export", "products:manage", "orders:manage"],
  VIEWER: ["analytics:read"]
};

export function hasAdminPermission(user: Pick<{ role: AdminRole }, "role">, permission: AdminPermission) {
  return rolePermissions[user.role].includes(permission);
}

export function assertAdminCan(user: Pick<{ role: AdminRole }, "role">, permission: AdminPermission) {
  if (!hasAdminPermission(user, permission)) {
    throw new Error("You do not have permission to perform this action.");
  }
}
