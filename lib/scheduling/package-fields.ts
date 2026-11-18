import { z } from "zod";

export const packageFieldNames = ["locations", "outfitChanges", "finalPhotos"] as const;
export type PackageField = typeof packageFieldNames[number];
export const packageFieldsSchema = z.array(z.enum(packageFieldNames)).max(packageFieldNames.length);

export function readPackageFields(settings: unknown): PackageField[] {
  const parsed = z.object({ packageFields: packageFieldsSchema.optional() }).safeParse(settings);
  return parsed.success && parsed.data.packageFields !== undefined
    ? [...new Set(parsed.data.packageFields)] : [...packageFieldNames];
}
