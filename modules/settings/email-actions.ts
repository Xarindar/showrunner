"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { getSiteSettings } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { encryptEmailSecret, decryptEmailSecret } from "@/lib/email/credential-crypto";
import { emailConnectionSchema, EmailConnectionError, sendConnectedEmail, sendWithEmailProvider } from "@/lib/email/provider-connection";

const emailPath = "/admin/modules/settings/email";
export type EmailSetupState = { error: string; testToken?: string; testedVersion?: string };

function testMessage(fromName: string, fromEmail: string, replyToEmail: string, toEmail: string) {
  return {
    messageId: `<${crypto.randomUUID()}@${fromEmail.split("@")[1]}>`,
    fromEmail, fromName, replyToEmail, toEmail, subject: "Your Showrunner email is working",
    textBody: "Showrunner can send customer emails through your own provider. You can change this connection in Settings → Email.",
    htmlBody: "<p>Showrunner can send customer emails through your own provider.</p><p>You can change this connection in Settings → Email.</p>"
  };
}

export async function saveEmailProviderAction(_previous: EmailSetupState, formData: FormData): Promise<EmailSetupState> {
  const user = await requireAdmin("settings:update");
  const settings = await getSiteSettings();
  const parsed = emailConnectionSchema.safeParse({ ...Object.fromEntries(formData), replyToEmail: formData.get("fromEmail"), testEmail: formData.get("fromEmail") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Check the connection details." };
  const { secret: enteredSecret, testEmail, revision, ...config } = parsed.data;
  const existing = await prisma.emailProviderConnection.findUnique({ where: { siteId: settings.siteId } });
  if ((existing?.revision || 0) !== revision) return { error: "This connection changed in another window. Reload before saving." };
  const canReuseSecret = existing && existing.kind === config.kind && existing.smtpHost === config.smtpHost
    && existing.smtpPort === config.smtpPort && existing.smtpUser === config.smtpUser;
  if (!enteredSecret && (!canReuseSecret || config.kind === "gmail")) return { error: "Enter the password for this email provider." };
  try {
    const secret = enteredSecret || decryptEmailSecret(existing!.encryptedSecret);
    const encryptedSecret = encryptEmailSecret(secret);
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify({ config, secret, revision })).digest("hex");
    if (formData.get("intent") === "test") {
      await sendWithEmailProvider(config, secret, testMessage(config.fromName, config.fromEmail, config.fromEmail, testEmail));
      return { error: "", testedVersion: String(formData.get("detailsVersion") || "0"), testToken: encryptEmailSecret(JSON.stringify({
        type: "email-provider-test", siteId: settings.siteId, userId: user.id, fingerprint, expires: Date.now() + 600_000
      })) };
    }
    let verified = false;
    try {
      const proof = JSON.parse(decryptEmailSecret(String(formData.get("testToken") || "")));
      verified = formData.get("intent") === "save" && proof.type === "email-provider-test" && proof.siteId === settings.siteId
        && proof.userId === user.id && proof.fingerprint === fingerprint && proof.expires > Date.now();
    } catch { /* An absent or invalid test receipt requires a fresh test. */ }
    if (!verified) return { error: "Send a successful test email for these details before choosing Done." };
    const data = { ...config, encryptedSecret, connectionError: "", verifiedAt: new Date() };
    if (existing) {
      const updated = await prisma.emailProviderConnection.updateMany({
        where: { siteId: settings.siteId, revision }, data: { ...data, revision: { increment: 1 } }
      });
      if (!updated.count) return { error: "The test was sent, but this connection changed in another window. Reload before saving." };
    } else {
      await prisma.emailProviderConnection.create({ data: { siteId: settings.siteId, ...data } });
    }
    await recordAuditLog({ action: "email.provider_connected", actor: user, siteId: settings.siteId,
      targetType: "email_provider_connection", targetId: settings.siteId, targetLabel: config.fromEmail,
      metadata: { provider: config.kind } });
  } catch (error) {
    return { error: error instanceof EmailConnectionError ? error.message
      : "The connection was not changed. Check your provider details and try again." };
  }
  revalidatePath(emailPath);
  revalidatePath("/admin/modules/communications");
  redirect(`${emailPath}?saved=connected`);
}

export async function sendProviderTestEmailAction() {
  const user = await requireAdmin("settings:update");
  const settings = await getSiteSettings();
  const connection = await prisma.emailProviderConnection.findUnique({ where: { siteId: settings.siteId } });
  if (!connection) redirect(`${emailPath}?error=Connect+an+email+provider+first.`);
  try {
    await sendConnectedEmail(settings.siteId, testMessage(connection.fromName, connection.fromEmail, connection.fromEmail, connection.fromEmail));
    await recordAuditLog({ action: "email.test_sent", actor: user, siteId: settings.siteId,
      targetType: "email_provider_connection", targetId: settings.siteId });
  } catch (error) {
    redirect(`${emailPath}?error=${encodeURIComponent(error instanceof EmailConnectionError ? error.message : "Could not send the test email. Check your connection.")}`);
  }
  revalidatePath(emailPath);
  redirect(`${emailPath}?saved=test`);
}

export async function disconnectEmailProviderAction(formData: FormData) {
  const user = await requireAdmin("settings:update");
  const settings = await getSiteSettings();
  const revision = Number(formData.get("revision"));
  if (!Number.isSafeInteger(revision) || revision < 1) redirect(`${emailPath}?error=Reload+before+disconnecting.`);
  const result = await prisma.emailProviderConnection.deleteMany({ where: { siteId: settings.siteId, revision } });
  if (!result.count) redirect(`${emailPath}?error=This+connection+changed.+Reload+before+disconnecting.`);
  await recordAuditLog({ action: "email.disconnected", actor: user, siteId: settings.siteId,
    targetType: "email_provider_connection", targetId: settings.siteId });
  revalidatePath(emailPath);
  redirect(`${emailPath}?saved=disconnected`);
}
