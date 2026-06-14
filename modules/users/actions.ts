"use server";

import bcrypt from "bcryptjs";
import { AdminRole, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordAuditLog } from "@/lib/audit";
import { adminUserCreateFormSchema, adminUserDeleteFormSchema, adminUserRoleFormSchema, parseForm } from "@/lib/admin-validation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function refreshUsers() {
  revalidatePath("/admin/modules/users");
}

async function ownerCount() {
  return prisma.adminUser.count({ where: { role: AdminRole.OWNER } });
}

export async function createAdminUserAction(formData: FormData) {
  const actor = await requireAdmin("users:manage");
  const input = await parseForm(adminUserCreateFormSchema, formData, "/admin/modules/users");
  const passwordHash = await bcrypt.hash(input.password, 12);

  try {
    const user = await prisma.adminUser.create({
      data: {
        email: input.email,
        passwordHash,
        role: input.role
      },
      select: { id: true, email: true, role: true }
    });

    await recordAuditLog({
      action: "admin_user.created",
      actor,
      metadata: { role: user.role },
      targetId: user.id,
      targetLabel: user.email,
      targetType: "admin_user"
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`/admin/modules/users?error=${encodeURIComponent("An admin user with that email already exists.")}`);
    }
    throw error;
  }

  refreshUsers();
  redirect("/admin/modules/users?saved=created");
}

export async function updateAdminUserRoleAction(formData: FormData) {
  const actor = await requireAdmin("users:manage");
  const input = await parseForm(adminUserRoleFormSchema, formData, "/admin/modules/users");
  const user = await prisma.adminUser.findUnique({
    where: { id: input.id },
    select: { id: true, email: true, role: true }
  });

  if (!user) {
    redirect(`/admin/modules/users?error=${encodeURIComponent("Admin user not found.")}`);
  }

  if (user.id === actor.id && input.role !== AdminRole.OWNER) {
    redirect(`/admin/modules/users?error=${encodeURIComponent("You cannot remove your own owner role.")}`);
  }

  if (user.role === AdminRole.OWNER && input.role !== AdminRole.OWNER && (await ownerCount()) <= 1) {
    redirect(`/admin/modules/users?error=${encodeURIComponent("Keep at least one owner account.")}`);
  }

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { role: input.role }
  });
  await recordAuditLog({
    action: "admin_user.role_updated",
    actor,
    metadata: {
      nextRole: input.role,
      previousRole: user.role
    },
    targetId: user.id,
    targetLabel: user.email,
    targetType: "admin_user"
  });

  refreshUsers();
  redirect("/admin/modules/users?saved=role");
}

export async function deleteAdminUserAction(formData: FormData) {
  const actor = await requireAdmin("users:manage");
  const input = await parseForm(adminUserDeleteFormSchema, formData, "/admin/modules/users");

  if (input.confirmDelete !== "on") {
    redirect(`/admin/modules/users?error=${encodeURIComponent("Confirm admin user deletion before removing access.")}`);
  }

  if (input.id === actor.id) {
    redirect(`/admin/modules/users?error=${encodeURIComponent("You cannot delete your own admin account.")}`);
  }

  const user = await prisma.adminUser.findUnique({
    where: { id: input.id },
    select: { id: true, email: true, role: true }
  });

  if (!user) {
    redirect(`/admin/modules/users?error=${encodeURIComponent("Admin user not found.")}`);
  }

  if (user.role === AdminRole.OWNER && (await ownerCount()) <= 1) {
    redirect(`/admin/modules/users?error=${encodeURIComponent("Keep at least one owner account.")}`);
  }

  await prisma.adminUser.delete({ where: { id: user.id } });
  await recordAuditLog({
    action: "admin_user.deleted",
    actor,
    metadata: { role: user.role },
    targetId: user.id,
    targetLabel: user.email,
    targetType: "admin_user"
  });

  refreshUsers();
  redirect("/admin/modules/users?saved=deleted");
}
