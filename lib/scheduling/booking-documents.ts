import { z } from "zod";
import { optionalRecordId } from "../record-id";
import { BookingRuleAnswerError, bookingRuleSchema, bookingRulesSchema, readBookingRules, type BookingRule } from "./booking-rules";

export const bookingDocumentKindSchema = z.enum(["INTAKE", "TERMS"]);
export type BookingDocumentKind = z.infer<typeof bookingDocumentKindSchema>;
export type BookingDocument = { id: string; name: string; kind: BookingDocumentKind; version: number; isDefault: boolean; rules: BookingRule[] };
export const bookingDocumentSelectionSchema = z.object({ intake: z.string().min(1,"Choose an intake form, the global default, or none.").max(100).default("default"), terms: z.string().min(1,"Choose booking terms, the global default, or none.").max(100).default("default") });
export const bookingDocumentSelectionFormSchema = z.string().max(1000).transform((value, ctx) => {
  try { return JSON.parse(value) as unknown; } catch { ctx.addIssue({code:"custom",message:"Choose valid booking forms and terms."}); return z.NEVER; }
}).pipe(bookingDocumentSelectionSchema);
export const bookingDocumentInputSchema = z.object({
  id: optionalRecordId, version: z.number().int().positive().optional(),
  name: z.string().trim().min(1,"Name this form or terms document.").max(100),
  kind: bookingDocumentKindSchema, isDefault: z.boolean(), rules: bookingRulesSchema.min(1,"Add a question or terms before saving.")
}).superRefine((value, ctx) => {
  if (value.rules.some(rule=>rule.contactField)) ctx.addIssue({code:"custom",message:"Contact details are already required by the booking flow."});
  if (value.kind === "TERMS" && value.rules.some(rule=>rule.kind !== "policy")) ctx.addIssue({code:"custom",message:"Terms documents contain booking terms only."});
  if (value.id && !value.version) ctx.addIssue({code:"custom",message:"Reload this document before editing."});
  if (value.version && !value.id) ctx.addIssue({code:"custom",message:"This document is missing its ID. Reopen it before saving."});
});
export const effectiveBookingRulesSchema = z.array(bookingRuleSchema).max(120);

type ServiceRequirements = { bookingDocumentSelection?: unknown; bookingRules?: unknown; intakePrompt?: string | null; policyText?: string | null; requirePolicy?: boolean; updatedAt?: Date };
export function resolveBookingRequirements(service: ServiceRequirements, documents: BookingDocument[]) {
  const selection = bookingDocumentSelectionSchema.parse(service.bookingDocumentSelection ?? {});
  const selected: BookingDocument[] = [];
  for (const [key,kind] of [["intake","INTAKE"],["terms","TERMS"]] as const) {
    const value=selection[key];
    if (value === "none") continue;
    const document=documents.find(item=>item.kind===kind && (value==="default" ? item.isDefault : item.id===value));
    if (!document && value!=="default") throw new BookingRuleAnswerError("A selected booking form or terms document is no longer available. Contact the business.");
    if (document) selected.push(document);
  }
  const legacy=readBookingRules(service.bookingRules,service).filter(rule=>!rule.contactField && !selected.some(document=>document.rules.some(saved=>saved.kind===rule.kind&&saved.label.trim().toLowerCase()===rule.label.trim().toLowerCase())));
  const rules=effectiveBookingRulesSchema.parse([...selected.flatMap(document=>document.rules.filter(rule=>!rule.contactField).map((rule,index)=>({...rule,id:`${document.kind}:${document.id.slice(0,40)}:${index}`}))),...legacy]);
  const policies=rules.filter(rule=>rule.kind==="policy");
  return {
    bookingRules: selected.length || service.bookingRules!=null ? rules : null,
    rules,
    policyText: policies.map(rule=>rule.label).join("\n\n"),
    requirePolicy: policies.length>0 && (selected.some(document=>document.rules.some(rule=>rule.kind==="policy")) || Boolean(service.requirePolicy)),
    documents: selected.map(({id,name,kind,version})=>({id,name,kind,version})),
    revision: `v1;${service.updatedAt?.getTime() ?? "legacy"};${selected.map(document=>`${document.id}.${document.version}`).join(";")}`
  };
}
export function validateBookingRequirementsRevision(requirements: ReturnType<typeof resolveBookingRequirements>, revision?: string) {
  if ((revision || requirements.documents.length) && revision!==requirements.revision) throw new BookingRuleAnswerError("The booking form or terms have changed. Reload the booking page and review them before submitting.");
}
