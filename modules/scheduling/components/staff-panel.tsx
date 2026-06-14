import type { StaffMember } from "@prisma/client";
import { Plus, Save } from "lucide-react";
import { createStaffMemberAction, updateStaffMemberAction } from "../actions";

type StaffPanelProps = {
  staff: StaffMember[];
  assignedStaffIds: Set<string>;
  staffIdsWithAvailability: Set<string>;
};

export function StaffPanel({ staff, assignedStaffIds, staffIdsWithAvailability }: StaffPanelProps) {
  return (
    <section className="grid-2">
      <form action={createStaffMemberAction} className="card form-grid">
        <h2 style={{ fontSize: "1.35rem" }}>Add staff</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="staff-name">Name</label>
            <input id="staff-name" name="name" required />
          </div>
          <div className="field">
            <label htmlFor="staff-title">Title</label>
            <input id="staff-title" name="title" placeholder="Photographer, stylist, consultant" />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="staff-email">Email</label>
            <input id="staff-email" name="email" type="email" />
          </div>
          <div className="field">
            <label htmlFor="staff-phone">Phone</label>
            <input id="staff-phone" name="phone" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="staff-bio">Bio</label>
          <textarea id="staff-bio" name="bio" />
        </div>
        <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <input name="isActive" type="checkbox" defaultChecked />
          Active for booking
        </label>
        <button className="button" type="submit">
          <Plus size={18} />
          Add staff
        </button>
      </form>

      <div className="card">
        <h2 style={{ fontSize: "1.35rem" }}>Staff roster</h2>
        <table className="table">
          <tbody>
            {staff.map((member) => {
              const needsAvailability = member.isActive && assignedStaffIds.has(member.id) && !staffIdsWithAvailability.has(member.id);
              return (
              <tr key={member.id}>
                <td>
                  <details>
                    <summary>
                      <strong>{member.name}</strong>{" "}
                      <span className={member.isActive ? "pill success" : "pill danger"}>
                        {member.isActive ? "active" : "inactive"}
                      </span>{" "}
                      {needsAvailability ? <span className="pill warning">no hours set — not bookable</span> : null}
                    </summary>
                    {needsAvailability ? (
                      <p style={{ color: "var(--muted)", marginTop: 8 }}>
                        {member.name} is assigned to a service but has no personal weekly availability rules, so they
                        won&apos;t appear as a bookable option. Add their hours in Availability rules below to make
                        them bookable.
                      </p>
                    ) : null}
                    <form action={updateStaffMemberAction} className="form-grid" style={{ marginTop: 12 }}>
                      <input type="hidden" name="id" value={member.id} />
                      <div className="grid-2">
                        <div className="field">
                          <label htmlFor={`staff-${member.id}-name`}>Name</label>
                          <input id={`staff-${member.id}-name`} name="name" defaultValue={member.name} required />
                        </div>
                        <div className="field">
                          <label htmlFor={`staff-${member.id}-title`}>Title</label>
                          <input id={`staff-${member.id}-title`} name="title" defaultValue={member.title} />
                        </div>
                      </div>
                      <div className="grid-2">
                        <div className="field">
                          <label htmlFor={`staff-${member.id}-email`}>Email</label>
                          <input id={`staff-${member.id}-email`} name="email" type="email" defaultValue={member.email} />
                        </div>
                        <div className="field">
                          <label htmlFor={`staff-${member.id}-phone`}>Phone</label>
                          <input id={`staff-${member.id}-phone`} name="phone" defaultValue={member.phone} />
                        </div>
                      </div>
                      <div className="field">
                        <label htmlFor={`staff-${member.id}-bio`}>Bio</label>
                        <textarea id={`staff-${member.id}-bio`} name="bio" defaultValue={member.bio} />
                      </div>
                      <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                        <input name="isActive" type="checkbox" defaultChecked={member.isActive} />
                        Active for booking
                      </label>
                      <button className="button secondary" type="submit">
                        <Save size={16} />
                        Save staff
                      </button>
                    </form>
                  </details>
                </td>
              </tr>
              );
            })}
            {!staff.length ? (
              <tr>
                <td>No staff members yet. Services can still use business-wide availability.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
