import type { EmailCategory, EmailProviderEventType } from "@prisma/client";

export type EmailTokenValue = string | number | Date | null | undefined;
export type EmailTokens = Record<string, EmailTokenValue>;
export type EmailHeaders = Record<string, string>;

export type QueueEmailInput = {
  siteId?: string;
  templateKey: string;
  recipientEmail: string;
  recipientName?: string;
  category: EmailCategory;
  relatedType?: string;
  relatedId?: string;
  tokens: EmailTokens;
  senderIdentityId?: string;
  idempotencyKey: string;
  headers?: EmailHeaders;
  unsubscribeUrl?: string;
  preferencesUrl?: string;
  campaignId?: string;
  subscriberId?: string;
};

export type QueueAdminEmailInput = {
  siteId?: string;
  templateKey: string;
  groupKey: string;
  overrideEmail?: string | null;
  relatedType?: string;
  relatedId?: string;
  tokens: EmailTokens;
  idempotencyKeyBase: string;
};

export type SendEmailInput = {
  messageId?: string;
  fromName: string;
  fromEmail: string;
  replyToEmail?: string;
  toEmail: string;
  toName?: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  headers?: EmailHeaders;
};

export type SendEmailResult = {
  providerMessageId?: string;
};

export type EmailProvider = {
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
};

export type ProcessEmailOutboxResult = {
  processed: number;
  sent: number;
  failed: number;
  retried: number;
  suppressed: number;
  skipped: number;
};

export type ProviderEventInput = {
  providerMessageId: string;
  eventType: EmailProviderEventType;
  eventKey?: string;
  payload?: unknown;
};
