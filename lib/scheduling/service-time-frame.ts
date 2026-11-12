import { z } from "zod";

export const maxSessionMinutes = 2880;
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time with AM or PM.");
export const serviceTimeFrameSchema = z.object({ start: clockTime, end: clockTime, endsNextDay: z.boolean().optional() }).refine(
  value => timeFrameMinutes(value).end > timeFrameMinutes(value).start,
  { message: "End time must be after start time. Choose Next Day for an overnight window.", path: ["end"] }
);
export type ServiceTimeFrame = z.infer<typeof serviceTimeFrameSchema>;

export function editTimeFrame(frame: ServiceTimeFrame, change: Partial<Pick<ServiceTimeFrame, "start" | "end">>) {
  const next = { ...frame, ...change };
  if (next.start && next.end && next.end <= next.start) next.endsNextDay = true;
  return next;
}

export function timeFrameMinutes(frame: { start: string; end: string; endsNextDay?: boolean }) {
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return { start: minutes(frame.start), end: minutes(frame.end) + (frame.endsNextDay ? 1440 : 0) };
}

export function timeFrameDays(frame: ServiceTimeFrame, weekday: number) {
  const { start, end } = timeFrameMinutes(frame);
  const segments = [{ weekday, start, end: Math.min(end, 1440) }];
  if (end > 1440) segments.push({ weekday: (weekday + 1) % 7, start: 0, end: end - 1440 });
  return segments;
}

export function timeFrameCovered(days: ReturnType<typeof timeFrameDays>, rules: Array<{ weekday: number; startMinutes: number; endMinutes: number }>) {
  return days.every(day => {
    let covered = day.start;
    for (const rule of rules.filter(rule => rule.weekday === day.weekday).sort((a, b) => a.startMinutes - b.startMinutes)) {
      if (rule.startMinutes > covered) break;
      covered = Math.max(covered, rule.endMinutes);
      if (covered >= day.end) return true;
    }
    return false;
  });
}
