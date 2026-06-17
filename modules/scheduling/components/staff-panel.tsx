import type { AdminRole, StaffMember } from "@prisma/client";
import { Link2, Plus, Save } from "lucide-react";
import { createStaffMemberAction, linkStaffMemberAdminUserAction, updateStaffMemberAction } from "../actions";

type StaffPanelProps = {
  staff: StaffMember[];
  assignedStaffIds: Set<string>;
  staffIdsWithAvailability: Set<string>;
  adminUsers: { id: string; email: string; role: AdminRole }[];
  canLinkStaffAccounts: boolean;
};

export function StaffPanel({ staff, assignedStaffIds, staffIdsWithAvailability, adminUsers, canLinkStaffAccounts }: StaffPanelProps) {
  return (
    <section className="grid-2">
      <form action={createStaffMemberAction} className="ui-card ui-card-density-normal ui-card-min-none form-grid">
        <h2 className="section-title">Add staff</h2>
        <div className="grid-2">
          <div className="ui-field">
            <label htmlFor="staff-name">Name</label>
            <input id="staff-name" name="name" required />
          </div>
          <div className="ui-field">
            <label htmlFor="staff-title">Title</label>
            <input id="staff-title" name="title" placeholder="Photographer, stylist, consultant" />
          </div>
        </div>
        <div className="grid-2">
          <div className="ui-field">
            <label htmlFor="staff-email">Email</label>
            <input id="staff-email" name="email" type="email" />
          </div>
          <div className="ui-field">
            <label htmlFor="staff-phone">Phone</label>
            <input id="staff-phone" name="phone" />
          </div>
        </div>
        <div className="ui-field">
          <label htmlFor="staff-bio">Bio</label>
          <textarea id="staff-bio" name="bio" />
        </div>
        <label className="ui-zero">
          <input name="isActive" type="checkbox" defaultChecked />
          Active for booking
        </label>
        <button className="ui-button" type="submit">
          <Plus size={18} />
          Add staff
        </button>
      </form>

      <div className="ui-card ui-card-density-normal ui-card-min-md">
        <h2 className="section-title">Staff roster</h2>
        <table className="ui-table">
          <tbody>
            {staff.map((member) => {
              const needsAvailability = member.isActive && assignedStaffIds.has(member.id) && !staffIdsWithAvailability.has(member.id);
              return (
              <tr key={member.id}>
                <td>
                  <details>
                    <summary>
                      <strong>{member.name}</strong>{" "}
                      <span className={member.isActive ? "ui-badge ui-badge-success" : "ui-badge ui-badge-danger"}>
                        {member.isActive ? "active" : "inactive"}
                      </span>{" "}
                      {needsAvailability ? <span className="ui-badge ui-badge-warning">no hours set — not bookable</span> : null}
                    </summary>
                    {needsAvailability ? (
                      <p className="ui-zero">
                        {member.name} is assigned to a service but has no personal weekly availability rules, so they
                        won&apos;t appear as a bookable option. Add their hours in Availability rules below to make
                        them bookable.
                      </p>
                    ) : null}
                    <form action={updateStaffMemberAction} className="form-grid ui-zero">
                      <input type="hidden" name="id" value={member.id} />
                      <div className="grid-2">
                        <div className="ui-field">
                          <label htmlFor={`staff-${member.id}-name`}>Name</label>
                          <input id={`staff-${member.id}-name`} name="name" defaultValue={member.name} required />
                        </div>
                        <div className="ui-field">
                          <label htmlFor={`staff-${member.id}-title`}>Title</label>
                          <input id={`staff-${member.id}-title`} name="title" defaultValue={member.title} />
                        </div>
                      </div>
                      <div className="grid-2">
                        <div className="ui-field">
                          <label htmlFor={`staff-${member.id}-email`}>Email</label>
                          <input id={`staff-${member.id}-email`} name="email" type="email" defaultValue={member.email} />
                        </div>
                        <div className="ui-field">
                          <label htmlFor={`staff-${member.id}-phone`}>Phone</label>
                          <input id={`staff-${member.id}-phone`} name="phone" defaultValue={member.phone} />
                        </div>
                      </div>
                      <div className="ui-field">
                        <label htmlFor={`staff-${member.id}-bio`}>Bio</label>
                        <textarea id={`staff-${member.id}-bio`} name="bio" defaultValue={member.bio} />
                      </div>
                      <label className="ui-zero">
                        <input name="isActive" type="checkbox" defaultChecked={member.isActive} />
                        Active for booking
                      </label>
                      <button className="ui-button ui-button-secondary" type="submit">
                        <Save size={16} />
                        Save staff
                      </button>
                    </form>
                    {canLinkStaffAccounts ? (
                      <form
                        action={linkStaffMemberAdminUserAction}
                        className="form-grid ui-zero">
                        <input type="hidden" name="staffId" value={member.id} />
                        <div className="ui-field ui-zero">
                          <label htmlFor={`staff-${member.id}-admin-link`}>Linked admin account</label>
                          <select id={`staff-${member.id}-admin-link`} name="adminUserId" defaultValue={member.adminUserId || ""}>
                            <option value="">Not linked</option>
                            {adminUsers.map((adminUser) => (
                              <option key={adminUser.id} value={adminUser.id}>
                                {adminUser.email} ({adminUser.role})
                              </option>
                            ))}
                          </select>
                        </div>
                        <button className="ui-button ui-button-secondary" type="submit">
                          <Link2 size={16} />
                          Update link
                        </button>
                      </form>
                    ) : null}
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
