export type FormFieldValidationRules = {
  maxLength?: number;
  maxValue?: number;
  minLength?: number;
  minValue?: number;
  pattern?: string;
  requiredMessage?: string;
};

type ValidateFormFieldValueInput = {
  fieldLabel: string;
  isRequired: boolean;
  rules: unknown;
  value: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
}

function nonNegativeInteger(value: unknown) {
  const parsed = finiteNumber(value);
  if (parsed === undefined) return undefined;
  const integer = Math.trunc(parsed);
  return integer >= 0 ? integer : undefined;
}

export function normalizeValidationRules(value: unknown): FormFieldValidationRules {
  if (!isRecord(value)) return {};

  const minLength = nonNegativeInteger(value.minLength);
  const maxLength = nonNegativeInteger(value.maxLength);
  const minValue = finiteNumber(value.minValue);
  const maxValue = finiteNumber(value.maxValue);
  const pattern = typeof value.pattern === "string" ? value.pattern.trim() : "";
  const requiredMessage = typeof value.requiredMessage === "string" ? value.requiredMessage.trim().slice(0, 240) : "";
  const rules: FormFieldValidationRules = {};

  if (minLength !== undefined) rules.minLength = minLength;
  if (maxLength !== undefined) rules.maxLength = maxLength;
  if (minValue !== undefined) rules.minValue = minValue;
  if (maxValue !== undefined) rules.maxValue = maxValue;
  if (pattern) rules.pattern = pattern.slice(0, 500);
  if (requiredMessage) rules.requiredMessage = requiredMessage;

  return rules;
}

export function validateFormFieldValue({ fieldLabel, isRequired, rules: rawRules, value }: ValidateFormFieldValueInput) {
  const rules = normalizeValidationRules(rawRules);
  const trimmedValue = value.trim();

  if (isRequired && !trimmedValue) {
    return rules.requiredMessage || `Complete ${fieldLabel}.`;
  }

  if (!trimmedValue) return "";

  if (rules.minLength !== undefined && trimmedValue.length < rules.minLength) {
    return `${fieldLabel} must be at least ${rules.minLength} characters.`;
  }

  if (rules.maxLength !== undefined && trimmedValue.length > rules.maxLength) {
    return `${fieldLabel} must be ${rules.maxLength} characters or fewer.`;
  }

  if (rules.minValue !== undefined || rules.maxValue !== undefined) {
    const numericValue = Number(trimmedValue);
    if (!Number.isFinite(numericValue)) return `${fieldLabel} must be a number.`;
    if (rules.minValue !== undefined && numericValue < rules.minValue) return `${fieldLabel} must be at least ${rules.minValue}.`;
    if (rules.maxValue !== undefined && numericValue > rules.maxValue) return `${fieldLabel} must be no more than ${rules.maxValue}.`;
  }

  if (rules.pattern) {
    try {
      const regex = new RegExp(rules.pattern);
      if (!regex.test(trimmedValue)) return `${fieldLabel} is not in the expected format.`;
    } catch {
      return `${fieldLabel} is not configured with a valid pattern.`;
    }
  }

  return "";
}
