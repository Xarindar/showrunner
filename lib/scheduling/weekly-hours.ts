import { minutesToTime } from "../format";
import { z } from "zod";

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time.")
  .transform(value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3)));

export const weeklyHoursSchema = z.object({
  staffId: z.string(),
  resourceId: z.string(),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  ranges: z.array(z.object({ start: time, end: time })
    .refine(range => range.end > range.start, "Hours must end after they start.")).max(24),
  revision: z.string()
}).refine(value => !value.staffId || !value.resourceId, "Choose a staff member or resource, not both.")
  .refine(value => {
    const ranges = [...value.ranges].sort((a, b) => a.start - b.start);
    return ranges.every((range, i) => i === 0 || range.start >= ranges[i - 1].end);
  }, "Time ranges must not overlap.");

export function hoursRevision(rules: Array<{ id: string; weekday: number; startMinutes: number; endMinutes: number }>) {
  return JSON.stringify(rules.map(rule => [rule.id, rule.weekday, rule.startMinutes, rule.endMinutes]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

export function dayHoursDraft(rules: Array<{ weekday: number; startMinutes: number; endMinutes: number }>, day: number) {
  const ranges = rules.filter(rule => rule.weekday === day).sort((a, b) => a.startMinutes - b.startMinutes)
    .map(rule => ({ start: minutesToTime(rule.startMinutes), end: minutesToTime(rule.endMinutes) }));
  return { accepting: ranges.length > 0, ranges: ranges.length ? ranges : [{ start: "09:00", end: "17:00" }] };
}
