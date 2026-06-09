"use server";

import { redirect } from "next/navigation";
import { createSession, verifyAdminLogin } from "@/lib/auth";

export type LoginState = {
  error?: string;
};

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  const user = await verifyAdminLogin(identifier, password);
  if (!user) {
    return { error: "Username or password is incorrect." };
  }

  await createSession(user.id);
  redirect("/admin");
}
