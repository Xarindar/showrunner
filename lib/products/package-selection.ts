import { z } from "zod";

/** Omitted fields preserve existing defaults; an explicitly blank field clears one. */
export const packagePhotoAllowanceField = z.string().trim()
  .refine((value) => value === "" || /^\d+$/.test(value), "Included photos must be a whole number.")
  .transform((value) => value === "" ? null : Number(value))
  .refine((value) => value === null || (Number.isSafeInteger(value) && value >= 0 && value <= 10000), "Included photos must be between 0 and 10,000.")
  .optional();

export const packageExtraPhotoPriceField = z.string().trim()
  .refine((value) => value === "" || /^\d+(\.\d{1,2})?$/.test(value), "Enter an extra-photo price with at most two decimal places.")
  .transform((value) => value === "" ? null : Math.round(Number(value) * 100))
  .refine((value) => value === null || (Number.isSafeInteger(value) && value >= 0 && value <= 2147483647), "Enter an extra-photo price below 21,474,836.48.")
  .optional();

export function packageSelectionData(input: { type: string; photoSelectionAllowance?: number | null; extraPhotoPrice?: number | null }) {
  if (input.type !== "SERVICE_PACKAGE") return {};
  return {
    ...(input.photoSelectionAllowance !== undefined ? { photoSelectionAllowance: input.photoSelectionAllowance } : {}),
    ...(input.extraPhotoPrice !== undefined ? { extraPhotoPriceCents: input.extraPhotoPrice } : {})
  };
}
