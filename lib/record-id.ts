import { z } from "zod";

const recordIdText = z.string().trim().max(100);

// HTML forms send empty strings for optional IDs; stored references use null.
export const optionalRecordId = recordIdText.transform(value => value || undefined).optional();
export const nullableRecordId = recordIdText.nullable().transform(value => value === "" ? null : value).optional();
