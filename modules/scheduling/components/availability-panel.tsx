"use client";

import { useActionState, useEffect, useState } from "react";
import type { AvailabilityRule, Resource, StaffMember } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Notification, useNotify } from "@/components/ui/notifications";
import { formatTimeValue, minutesToTime } from "@/lib/format";
import { weekdays } from "@/lib/scheduling/constants";
import { dayHoursDraft, hoursRevision } from "@/lib/scheduling/weekly-hours";
import { saveWeeklyHoursAction } from "../actions";
import { TimeInput } from "@/components/ui/time-input";
import styles from "./weekly-hours.module.css";

type Props = {
  availability: Array<AvailabilityRule & { resource: Resource | null; staff: StaffMember | null }>;
  resources: Resource[];
  staff: StaffMember[];
  timezone?: string;
};

function DayEditor({ day, rules, staffId, resourceId, onClose }: {
  day: number; rules: Props["availability"]; staffId: string; resourceId: string; onClose: () => void;
}) {
  const [revision] = useState(() => hoursRevision(rules));
  const [accepting, setAccepting] = useState(() => dayHoursDraft(rules, day).accepting);
  const [ranges, setRanges] = useState(() => dayHoursDraft(rules, day).ranges);
  const [days, setDays] = useState([day]);
  const [state, action, pending] = useActionState(saveWeeklyHoursAction, { error: "", success: "" });
  const notify = useNotify();
  useEffect(() => {
    if (!state.success) return;
    notify(state.success);
    onClose();
  }, [state.success, notify, onClose]);
  return <form action={action} className={styles.editor}>
    <input type="hidden" name="hours" value={JSON.stringify({ staffId, resourceId, days, ranges: accepting ? ranges : [], revision })} />
      <label className={styles.toggle}><input type="checkbox" checked={accepting} disabled={pending} onChange={event => setAccepting(event.target.checked)} /> Accept appointments</label>
      {!accepting && <p className="muted-text ui-zero">No bookable hours for this schedule on the selected days.</p>}
      {accepting && ranges.map((range, index) => <div className={styles.range} key={index}>
        <label>From<TimeInput aria-label={`Start time ${index + 1}`} required value={range.start} disabled={pending} onValueChange={start => setRanges(ranges.map((value, i) => i === index ? { ...value, start } : value))} /></label>
        <label>To<TimeInput aria-label={`End time ${index + 1}`} required value={range.end} disabled={pending} onValueChange={end => setRanges(ranges.map((value, i) => i === index ? { ...value, end } : value))} /></label>
        <Button type="button" variant="ghost" disabled={pending || ranges.length === 1} aria-label={`Remove time range ${index + 1}`} onClick={() => setRanges(ranges.filter((_, i) => i !== index))}>Remove</Button>
      </div>)}
      {accepting && <Button type="button" variant="secondary" disabled={pending || ranges.length >= 24} onClick={() => setRanges([...ranges, { start: "", end: "" }])}>Add another time range</Button>}
      <details><summary>Copy to other days</summary>
        <p className="muted-text">Replaces the hours on each selected day.</p>
        <div className={styles.days}>{weekdays.map((name, index) => <label key={name}><input type="checkbox" checked={days.includes(index)} disabled={index === day || pending} onChange={event => setDays(event.target.checked ? [...days, index] : days.filter(value => value !== index))} />{name}</label>)}</div>
      </details>
      {state.error && <Notification tone="danger" eventKey={state}>{state.error}</Notification>}
      <div className="module-modal-actions"><Button variant="secondary" type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save hours"}</Button></div>
  </form>;
}

export function AvailabilityPanel({ availability, resources, staff, timezone }: Props) {
  const [scope, setScope] = useState("");
  const [editing, setEditing] = useState<{ day: number; rules: Props["availability"]; staffId: string; resourceId: string } | null>(null);
  const staffId = scope.startsWith("staff:") ? scope.slice(6) : "";
  const resourceId = scope.startsWith("resource:") ? scope.slice(9) : "";
  const rules = availability.filter(rule => (rule.staffId || "") === staffId && (rule.resourceId || "") === resourceId);
  const owner = staff.find(member => member.id === staffId) || resources.find(resource => resource.id === resourceId);
  return <section className={styles.week} aria-label="Weekly hours">
    <div className={styles.heading}><h2>Weekly hours</h2>{timezone && <span className="muted-text">{timezone.replaceAll("_", " ")}</span>}</div>
    {scope && <div className={styles.heading}><strong>{owner?.name}</strong><Button type="button" variant="secondary" onClick={() => setScope("")}>Back to business hours</Button></div>}
    <Card bodyClassName={styles.rows}>
      {weekdays.map((name, day) => <div className={styles.row} key={name}>
        <strong>{name}</strong>
        <span>{rules.filter(rule => rule.weekday === day).sort((a, b) => a.startMinutes - b.startMinutes).map(rule => `${formatTimeValue(minutesToTime(rule.startMinutes))} – ${formatTimeValue(minutesToTime(rule.endMinutes))}`).join(", ") || (scope ? "No hours set" : "Closed")}</span>
        <Button type="button" variant="ghost" aria-label={`Edit ${name} hours`} disabled={owner?.isActive === false} onClick={() => setEditing({ day, rules: rules.map(rule => ({ ...rule })), staffId, resourceId })}>Edit</Button>
      </div>)}
    </Card>
    {(staff.length > 0 || resources.length > 0) && <details>
      <summary>Staff & resource hours</summary>
      <p className="muted-text">Staff and resources use their own hours. Business hours do not replace these schedules.</p>
      {[...staff.map(member => ({ ...member, scope: `staff:${member.id}`, kind: "Staff" })), ...resources.map(resource => ({ ...resource, scope: `resource:${resource.id}`, kind: "Resource" }))].map(owner => <div className={styles.row} key={owner.scope}>
        <strong>{owner.name}</strong><span className="muted-text">{owner.kind}{!owner.isActive ? " · Inactive" : ""}</span>
        <Button type="button" variant="ghost" onClick={() => setScope(owner.scope)}>View hours</Button>
      </div>)}
    </details>}
    <Modal title={`${editing === null ? "" : weekdays[editing.day]} hours${owner ? ` · ${owner.name}` : ""}`} open={editing !== null} onClose={() => setEditing(null)}>
      {editing !== null && <DayEditor key={`${scope}:${editing.day}`} {...editing} onClose={() => setEditing(null)} />}
    </Modal>
  </section>;
}
