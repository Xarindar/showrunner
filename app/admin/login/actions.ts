"use server";

import { redirect } from "next/navigation";
import { createSession, verifyAdminLogin } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";

export type LoginState = {
  error?: string;
};

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  const user = await verifyAdminLogin(identifier, password);
  if (!user) {
    await recordAuditLog({
      action: "admin.sign_in_failed",
      actor: { email: identifier },
      metadata: { email: identifier },
      targetType: "admin_session"
    });
    return { error: "Username or password is incorrect." };
  }

  await createSession(user.id);
  await recordAuditLog({
    action: "admin.sign_in",
    actor: user,
    targetId: user.id,
    targetLabel: user.email,
    targetType: "admin_user"
  });
  redirect("/admin");
}
