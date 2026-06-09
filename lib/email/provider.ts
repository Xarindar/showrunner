import crypto from "node:crypto";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { positiveIntegerEnv } from "@/lib/env";
import type { EmailProvider, SendEmailInput } from "./types";

let transport: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null = null;

type PooledSmtpOptions = SMTPTransport.Options & {
  pool: boolean;
  maxConnections: number;
  maxMessages: number;
  connectionTimeout: number;
  socketTimeout: number;
};

function getTransportConfig(): PooledSmtpOptions | null {
  if (!process.env.SMTP_HOST) return null;

  const port = positiveIntegerEnv("SMTP_PORT", 587);

  return {
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    pool: true,
    maxConnections: positiveIntegerEnv("SMTP_MAX_CONNECTIONS", 3),
    maxMessages: positiveIntegerEnv("SMTP_MAX_MESSAGES", 100),
    connectionTimeout: positiveIntegerEnv("SMTP_CONNECTION_TIMEOUT_MS", 10000),
    socketTimeout: positiveIntegerEnv("SMTP_SOCKET_TIMEOUT_MS", 20000),
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
          }
        : undefined
  };
}

function address(name: string | undefined, email: string) {
  return name?.trim() ? { name: name.trim(), address: email } : email;
}

function getTransport(config: PooledSmtpOptions) {
  transport ??= nodemailer.createTransport(config);
  return transport;
}

export function createSmtpProvider(): EmailProvider {
  return {
    async sendEmail(input: SendEmailInput) {
      const config = getTransportConfig();

      if (!config) {
        if (process.env.NODE_ENV === "production") {
          throw new Error("SMTP_HOST is not configured.");
        }

        const providerMessageId = `dev:${crypto.randomUUID()}`;
        console.log("[email:dev]", {
          id: providerMessageId,
          from: input.fromEmail,
          to: input.toEmail,
          subject: input.subject
        });
        return { providerMessageId };
      }

      const result = await getTransport(config).sendMail({
        messageId: input.messageId,
        from: address(input.fromName, input.fromEmail),
        to: address(input.toName, input.toEmail),
        replyTo: input.replyToEmail || undefined,
        subject: input.subject,
        html: input.htmlBody,
        text: input.textBody,
        headers: input.headers
      });

      return { providerMessageId: result.messageId };
    }
  };
}
