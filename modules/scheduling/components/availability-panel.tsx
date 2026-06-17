import type { AvailabilityRule, Resource, StaffMember } from "@prisma/client";
import { Clock, Trash2 } from "lucide-react";
import { minutesToTime } from "@/lib/format";
import { weekdays } from "@/lib/scheduling/constants";
import { createAvailabilityAction, deleteAvailabilityAction } from "../actions";

type AvailabilityPanelProps = {
  availability: Array<AvailabilityRule & { resource: Resource | null; staff: StaffMember | null }>;
  resources: Resource[];
  staff: StaffMember[];
};

export function AvailabilityPanel({ availability, resources, staff }: AvailabilityPanelProps) {
  return (
    <section className="grid-2">
      <form action={createAvailabilityAction} className="card form-grid">
        <h2 className="section-title">Weekly availability</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="availability-staff">Staff</label>
            <select id="availability-staff" name="staffId" defaultValue="">
              <option value="">Business-wide</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id} disabled={!member.isActive}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="availability-resource">Resource</label>
            <select id="availability-resource" name="resourceId" defaultValue="">
              <option value="">None</option>
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id} disabled={!resource.isActive}>
                  {resource.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p style={{ color: "var(--muted)", margin: 0 }}>Choose either staff or resource for scoped hours, or leave both empty for business-wide hours.</p>
        <div className="grid-2">
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
        </div>
        <div className="grid-2">
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
        <h2 className="section-title">Availability rules</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Owner</th>
              <th>Day</th>
              <th>Hours</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {availability.map((rule) => (
              <tr key={rule.id}>
                <td>{rule.staff?.name || rule.resource?.name || "Business-wide"}</td>
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
