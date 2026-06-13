export const bookingTemplateKeys = [
  "booking.created.customer",
  "booking.created.admin",
  "booking.confirmed.customer",
  "booking.reminder.customer",
  "booking.rescheduled.customer",
  "booking.canceled.customer",
  "booking.delayed.customer",
  "booking.completed.admin"
] as const;

export const bookingTemplateKeySet = new Set<string>(bookingTemplateKeys);

export function bookingTemplateSortIndex(key: string | null) {
  if (!key) return bookingTemplateKeys.length;
  const index = bookingTemplateKeys.indexOf(key as (typeof bookingTemplateKeys)[number]);
  return index === -1 ? bookingTemplateKeys.length : index;
}
