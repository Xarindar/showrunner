import crypto from "node:crypto";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import nodemailer from "nodemailer";
import { z } from "zod";
import { prisma } from "../prisma";
import { decryptEmailSecret } from "./credential-crypto";
import type { SendEmailInput } from "./types";

const email = z.email().max(254).transform(value => value.toLowerCase());
const singleLine = z.string().trim().min(1).max(120).regex(/^[^\r\n]+$/, "Use a single line.");

export const emailConnectionSchema = z.object({
  kind: z.enum(["resend", "gmail", "ionos", "smtp"]),
  fromName: singleLine,
  fromEmail: email,
  replyToEmail: email,
  testEmail: email,
  secret: z.string().max(4096),
  smtpHost: z.string().trim().toLowerCase().max(253),
  smtpPort: z.coerce.number().refine(port => [465, 587, 2525].includes(port), "Choose a supported secure SMTP port."),
  smtpUser: z.string().trim().max(254),
  revision: z.coerce.number().int().min(0)
}).superRefine((value, ctx) => {
  if (value.kind === "smtp" && (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(value.smtpHost) || !value.smtpUser)) {
    ctx.addIssue({ code: "custom", message: "Enter your provider’s SMTP hostname and username.", path: ["smtpHost"] });
  }
}).transform(value => ({ ...value,
  smtpHost: value.kind === "gmail" ? "smtp.gmail.com" : value.kind === "ionos" ? "smtp.ionos.com" : value.kind === "smtp" ? value.smtpHost : "",
  smtpPort: value.kind === "gmail" || value.kind === "ionos" ? 465 : value.smtpPort,
  smtpUser: value.kind === "gmail" || value.kind === "ionos" ? value.fromEmail : value.kind === "smtp" ? value.smtpUser : "",
  secret: value.kind === "gmail" ? value.secret.replace(/\s/g, "") : value.kind === "resend" ? value.secret.trim() : value.secret
}));

export type ProviderConnectionConfig = Pick<z.infer<typeof emailConnectionSchema>, "smtpHost" | "smtpPort" | "smtpUser"> & { kind: string };

const blockedV4 = new BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) {
  blockedV4.addSubnet(address, prefix, "ipv4");
}
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
const blockedV6 = new BlockList();
blockedV6.addSubnet("2001::", 23, "ipv6");
blockedV6.addSubnet("2002::", 16, "ipv6");

export function isPublicSmtpAddress(address: string) {
  if (isIP(address) === 4) return !blockedV4.check(address, "ipv4");
  return isIP(address) === 6 && globalV6.check(address, "ipv6") && !blockedV6.check(address, "ipv6");
}

export class EmailConnectionError extends Error {
  constructor(message: string, public readonly needsAttention = false) { super(message); }
}

export async function sendWithEmailProvider(config: ProviderConnectionConfig, secret: string, input: SendEmailInput) {
  if (config.kind === "resend") {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json",
        "Idempotency-Key": crypto.createHash("sha256").update(input.messageId || crypto.randomUUID()).digest("hex") },
      body: JSON.stringify({ from: `"${input.fromName.replace(/["\\]/g, "\\$&")}" <${input.fromEmail}>`,
        to: [input.toEmail], reply_to: input.replyToEmail || input.fromEmail,
        subject: input.subject, html: input.htmlBody, text: input.textBody,
        headers: { ...input.headers, ...(input.messageId ? { "Message-ID": input.messageId } : {}) } })
    });
    if (!response.ok) {
      if ([401, 403, 422].includes(response.status)) throw new EmailConnectionError("Resend rejected the email. Check that your API key allows sending and that the sender domain is verified in Resend.", true);
      if (response.status === 429) throw new EmailConnectionError("Resend’s sending limit was reached. Check your account limits or try again later.");
      throw new EmailConnectionError("Resend could not send the email. Try again shortly.");
    }
    const result = z.object({ id: z.string().min(1) }).parse(await response.json());
    return { providerMessageId: result.id };
  }
  if (config.kind !== "smtp" && config.kind !== "gmail" && config.kind !== "ionos") throw new EmailConnectionError("Choose a supported email provider.");
  // Pin the resolved public address so a supplied hostname cannot reach internal services through DNS rebinding.
  const addresses = await lookup(config.smtpHost, { all: true });
  if (!addresses.length || addresses.some(entry => !isPublicSmtpAddress(entry.address))) {
    throw new EmailConnectionError("Use your email provider’s public SMTP hostname.");
  }
  const transport = nodemailer.createTransport({
    host: (addresses.find(entry => entry.family === 4) || addresses[0]).address, port: config.smtpPort, secure: config.smtpPort === 465,
    requireTLS: true, tls: { servername: config.smtpHost, minVersion: "TLSv1.2" },
    auth: { user: config.smtpUser, pass: secret },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    disableFileAccess: true, disableUrlAccess: true
  });
  try {
    const result = await transport.sendMail({
      messageId: input.messageId, from: { name: input.fromName, address: input.fromEmail },
      to: { name: input.toName || "", address: input.toEmail }, replyTo: input.replyToEmail || input.fromEmail,
      subject: input.subject, html: input.htmlBody, text: input.textBody, headers: input.headers
    });
    if (!result.accepted?.length) throw new EmailConnectionError("Your provider did not accept the test recipient. Check that email address.");
    return { providerMessageId: result.messageId };
  } catch (error) {
    if (error instanceof EmailConnectionError) throw error;
    const code = (error as { code?: string }).code;
    if (code === "EAUTH") throw new EmailConnectionError(config.kind === "ionos"
      ? "IONOS rejected the mailbox login. Use the full mailbox address and its email password, not your IONOS customer account password."
      : config.kind === "gmail" ? "Google rejected the login. Check the email address and app password; your regular Google password will not work."
      : "Your provider rejected the login. Check the SMTP username and password.", true);
    if (code === "EENVELOPE") throw new EmailConnectionError("Your provider rejected the sender or recipient. Check the addresses and sender verification.", true);
    throw new EmailConnectionError("Could not reach your email provider securely. Check the SMTP hostname, port, and whether your hosting allows outbound SMTP.");
  } finally { transport.close(); }
}

export async function sendConnectedEmail(siteId: string, input: SendEmailInput) {
  const connection = await prisma.emailProviderConnection.findUnique({ where: { siteId } });
  if (!connection || connection.fromEmail !== input.fromEmail.toLowerCase()) {
    throw new EmailConnectionError("The sending address changed. Review and resend this message from Communications.");
  }
  try {
    const result = await sendWithEmailProvider(connection, decryptEmailSecret(connection.encryptedSecret), { ...input, replyToEmail: connection.fromEmail });
    if (connection.connectionError) await prisma.emailProviderConnection.updateMany({
      where: { siteId, revision: connection.revision }, data: { connectionError: "" }
    });
    return result;
  } catch (error) {
    if (error instanceof EmailConnectionError && error.needsAttention) await prisma.emailProviderConnection.updateMany({
      where: { siteId, revision: connection.revision }, data: { connectionError: error.message }
    });
    throw error;
  }
}
