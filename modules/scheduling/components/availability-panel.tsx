import type { AvailabilityRule } from "@prisma/client";
import { Clock, Trash2 } from "lucide-react";
import { minutesToTime } from "@/lib/format";
import { weekdays } from "@/lib/scheduling/constants";
import { createAvailabilityAction, deleteAvailabilityAction } from "../actions";

type AvailabilityPanelProps = {
  availability: AvailabilityRule[];
};

export function AvailabilityPanel({ availability }: AvailabilityPanelProps) {
  return (
    <section className="grid-2">
      <form action={createAvailabilityAction} className="card form-grid">
        <h2 style={{ fontSize: "1.35rem" }}>Weekly availability</h2>
        <div className="grid-3">
          <div className="field">
            <label htmlFor="weekday">Day</label>
            <select id="weekday" name="weekday" defaultValue="1">
              {weekdays.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="startTime">Start</label>
            <input id="startTime" name="startTime" type="time" defaultValue="09:00" required />
          </div>
          <div className="field">
            <label htmlFor="endTime">End</label>
            <input id="endTime" name="endTime" type="time" defaultValue="17:00" required />
          </div>
        </div>
        <button className="button" type="submit">
          <Clock size={18} />
          Add availability
        </button>
      </form>

      <div className="card">
        <h2 style={{ fontSize: "1.35rem" }}>Availability rules</h2>
        <table className="table">
          <tbody>
            {availability.map((rule) => (
              <tr key={rule.id}>
                <td>{weekdays[rule.weekday]}</td>
                <td>
                  {minutesToTime(rule.startMinutes)} - {minutesToTime(rule.endMinutes)}
                </td>
                <td>
                  <form action={deleteAvailabilityAction}>
                    <input type="hidden" name="id" value={rule.id} />
                    <button className="button secondary" type="submit" title="Delete availability">
                      <Trash2 size={16} />
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {!availability.length ? (
              <tr>
                <td>No availability set.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
