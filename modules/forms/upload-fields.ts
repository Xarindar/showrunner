import { isRecord } from "@/lib/objects";

const supportedUploadMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"] as const;
const defaultAllowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
const maxFormUploadBytes = 25 * 1024 * 1024;
const defaultMaxUploadBytes = 10 * 1024 * 1024;

export type FormFieldUploadRules = {
  allowedMimeTypes: string[];
  maxSizeBytes: number;
};

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
}

function normalizeMimeTypes(value: unknown) {
  const rawTypes = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const supportedTypes = new Set<string>(supportedUploadMimeTypes);
  const normalized = rawTypes
    .map((type) => String(type).trim().toLowerCase())
    .filter((type) => supportedTypes.has(type));

  return Array.from(new Set(normalized)).slice(0, 12);
}

export function normalizeUploadRules(value: unknown): FormFieldUploadRules {
  const source = isRecord(value) ? value : {};
  const allowedMimeTypes = normalizeMimeTypes(source.fileAllowedMimeTypes || source.allowedMimeTypes);
  const maxSizeMb = finiteNumber(source.fileMaxSizeMb);
  const maxSizeBytes = finiteNumber(source.fileMaxSizeBytes) ?? (maxSizeMb !== undefined ? maxSizeMb * 1024 * 1024 : defaultMaxUploadBytes);

  return {
    allowedMimeTypes: allowedMimeTypes.length ? allowedMimeTypes : [...defaultAllowedMimeTypes],
    maxSizeBytes: Math.min(Math.max(1, Math.floor(maxSizeBytes)), maxFormUploadBytes)
  };
}

export function formatUploadSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function validateUploadedFile(input: { fieldLabel: string; file: File | null; isRequired: boolean; rules: unknown; requiredMessage?: string }) {
  const rules = normalizeUploadRules(input.rules);
  const file = input.file;

  if (!file || file.size === 0) {
    return input.isRequired ? input.requiredMessage || `Upload ${input.fieldLabel}.` : "";
  }

  if (!rules.allowedMimeTypes.includes(file.type.toLowerCase())) {
    return `${input.fieldLabel} must be one of: ${rules.allowedMimeTypes.join(", ")}.`;
  }

  if (file.size > rules.maxSizeBytes) {
    return `${input.fieldLabel} must be ${formatUploadSize(rules.maxSizeBytes)} or smaller.`;
  }

  return "";
}
