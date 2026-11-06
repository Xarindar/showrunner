import { z } from "zod";

export const bookingRuleSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(["intake", "policy"]),
  category: z.string().trim().min(1).max(80).transform(value => /^contracts?$/i.test(value) ? "Booking Terms & Conditions" : value),
  label: z.string().trim().min(1, "Add a question or booking terms.").max(2000),
  type: z.enum(["TEXT", "RADIO", "SELECT"]),
  required: z.boolean(),
  placeholder: z.string().max(200).default(""),
  helpText: z.string().max(500).default(""),
  options: z.array(z.string().trim().min(1).max(200)).max(30),
  contactField: z.enum(["customerName", "customerEmail", "customerPhone"]).optional()
}).superRefine((rule, ctx) => {
  if (rule.kind === "intake" && rule.type !== "TEXT" && (rule.options.length < 2 || new Set(rule.options.map(value => value.toLowerCase())).size !== rule.options.length)) {
    ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least two different choices." });
  }
  if (rule.contactField && (rule.kind !== "intake" || rule.type !== "TEXT")) ctx.addIssue({ code: "custom", message: "Contact fields use text boxes." });
});
export const bookingRulesSchema = z.array(bookingRuleSchema).max(40, "Use up to 40 rules.").superRefine((rules, ctx) => {
  if (new Set(rules.map(rule => rule.id)).size !== rules.length) ctx.addIssue({ code: "custom", message: "Each rule must have a different ID." });
  const contacts = rules.flatMap(rule => rule.contactField ? [rule.contactField] : []);
  if (new Set(contacts).size !== contacts.length) ctx.addIssue({ code: "custom", message: "Add each contact field only once." });
});
export type BookingRule = z.infer<typeof bookingRuleSchema>;
export type BookingRuleSet = { id: string; name: string; rules: BookingRule[] };
export const bookingRuleSetSchema = z.object({ name: z.string().trim().min(1, "Name this rule set.").max(100), rules: bookingRulesSchema.min(1, "Add a rule before saving a set.") });
export const bookingRulesFormSchema = z.string().max(120000).transform((value, ctx) => {
  try { return JSON.parse(value) as unknown; }
  catch { ctx.addIssue({ code: "custom", message: "The booking rules could not be read." }); return z.NEVER; }
}).pipe(bookingRulesSchema);

export function readBookingRules(value: unknown, legacy: { intakePrompt?: string | null; policyText?: string | null } = {}): BookingRule[] {
  if (value != null) return bookingRulesSchema.parse(value);
  return [
    ...(legacy.intakePrompt?.trim() ? [{ id: "legacy-intake", kind: "intake" as const, label: legacy.intakePrompt.trim(), category: "General" }] : []),
    ...(legacy.policyText?.trim() ? [{ id: "legacy-policy", kind: "policy" as const, label: legacy.policyText.trim(), category: "Booking Terms & Conditions" }] : [])
  ].map(rule => ({ ...rule, type: "TEXT", required: false, placeholder: "", helpText: "", options: [] }));
}

export const intakeAnswersSchema = z.record(z.string().min(1).max(100), z.string().trim().max(4000)).refine(value => Object.keys(value).length <= 40, "Too many answers.");
export class BookingRuleAnswerError extends Error {}

export function validateBookingRuleAnswers(rules: BookingRule[], input: unknown, contact: { customerName: string; customerEmail: string; customerPhone?: string }) {
  const parsed = intakeAnswersSchema.safeParse(input ?? {});
  if (!parsed.success) throw new BookingRuleAnswerError(parsed.error.issues[0].message);
  const answers = parsed.data;
  const fields = rules.filter(rule => rule.kind === "intake");
  if (Object.keys(answers).some(id => !fields.some(rule => rule.id === id))) throw new BookingRuleAnswerError("An intake answer does not belong to this service.");
  return fields.map(rule => {
    const value = (rule.contactField ? contact[rule.contactField] : answers[rule.id])?.trim() || "";
    if (rule.required && !value) throw new BookingRuleAnswerError(`Answer “${rule.label}” before booking.`);
    if (value && rule.type !== "TEXT" && !rule.options.includes(value)) throw new BookingRuleAnswerError(`Choose an available option for “${rule.label}”.`);
    return value ? `${rule.label}: ${value}` : "";
  }).filter(Boolean).join("\n");
}
