"use client";

import { useRouter } from "next/navigation";
import { DatePicker } from "@/components/ui/date-picker";

export function AppointmentDatePicker({ dateKey, label, compactLabel }: { dateKey: string; label: string; compactLabel?: string }) {
  const router = useRouter();
  return <DatePicker value={dateKey} label={label} compactLabel={compactLabel} onChange={date => {
    const url = new URL(window.location.href);
    url.searchParams.set("date", date);
    router.replace(`${url.pathname}${url.search}`);
  }} />;
}
