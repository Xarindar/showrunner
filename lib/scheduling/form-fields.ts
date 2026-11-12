import type { BookingRule } from "./booking-rules";

export function moveFormField(rules: BookingRule[], id: string, targetId: string) {
  const from = rules.findIndex(rule => rule.id === id);
  const to = rules.findIndex(rule => rule.id === targetId);
  if (from < 0 || to < 0 || from === to) return rules;
  const next = [...rules];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}
