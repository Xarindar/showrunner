import type { Prisma } from "@prisma/client";
import { stringArrayFromUnknown } from "@/lib/format";
import type { EmailTokens } from "./types";

type StoredTemplate = {
  subject: string;
  previewText: string;
  body: string;
  htmlBody: string;
  textBody: string;
  requiredTokens: Prisma.JsonValue;
};

const tokenPattern = /{{\s*([A-Za-z0-9_.-]+)\s*}}/g;

export function extractEmailTemplateTokens(value: string) {
  const tokens = new Set<string>();
  for (const match of value.matchAll(tokenPattern)) {
    tokens.add(match[1]);
  }

  return Array.from(tokens);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function textToHtml(value: string) {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  return paragraphs.map((part) => `<p>${escapeHtml(part).replaceAll("\n", "<br />")}</p>`).join("");
}

function tokenText(value: EmailTokens[string]) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function renderText(source: string, tokens: EmailTokens) {
  return source.replace(tokenPattern, (_match, key: string) => tokenText(tokens[key]));
}

function renderHtml(source: string, tokens: EmailTokens) {
  return source.replace(tokenPattern, (_match, key: string) => escapeHtml(tokenText(tokens[key])));
}

export function renderEmailTemplate(template: StoredTemplate, tokens: EmailTokens) {
  const missing = stringArrayFromUnknown(template.requiredTokens).filter((key) => tokens[key] === null || tokens[key] === undefined);

  if (missing.length) {
    throw new Error(`Missing email template token: ${missing.join(", ")}`);
  }

  const textSource = template.textBody || template.body;
  const htmlSource = template.htmlBody || textToHtml(textSource);

  return {
    subject: renderText(template.subject, tokens),
    previewText: renderText(template.previewText, tokens),
    htmlBody: renderHtml(htmlSource, tokens),
    textBody: renderText(textSource, tokens)
  };
}
