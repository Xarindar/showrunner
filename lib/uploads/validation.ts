import { z } from "zod";

export const maxFileBytes = 250 * 1024 * 1024;
export const maxRequestBytes = BigInt(10 * 1024 * 1024 * 1024);
export const maxRequestFiles = 200;
export const uploadInput = z.object({
  filename: z.string().trim().min(1).max(240).refine((name) => !/[\x00-\x1f\x7f/\\]/.test(name), "Choose a file with a valid filename."),
  sizeBytes: z.number().int().min(1).max(maxFileBytes),
  senderName: z.string().trim().min(1).max(120),
  senderEmail: z.email().max(254)
});

export function requestIsOpen(request: { closedAt: Date | null; expiresAt: Date }, now = new Date()) {
  return !request.closedAt && request.expiresAt > now;
}

export function attachmentDisposition(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\;]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`;
}
