import type { AdminRole, AvailabilityRule, Resource, StaffMember } from "@prisma/client";
import { AvailabilityPanel } from "./availability-panel";
import { Link2, Plus, Save } from "lucide-react";
import { createStaffMemberAction, linkStaffMemberAdminUserAction, updateStaffMemberAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EqualGrid } from "@/components/ui/layout";
import { Switch } from "@/components/ui/switch";

type StaffPanelProps = {
  staff: StaffMember[];
  availability: Array<AvailabilityRule & { resource: Resource | null; staff: StaffMember | null }>;
  timezone: string;
  assignedStaffIds: Set<string>;
  staffIdsWithAvailability: Set<string>;
  adminUsers: {id: string;email: string;role: AdminRole;}[];
  canLinkStaffAccounts: boolean;
};

export function StaffPanel({ availability, timezone, staff, assignedStaffIds, staffIdsWithAvailability, adminUsers, canLinkStaffAccounts }: StaffPanelProps) {
  return (
    <section className="form-grid">
      <details>
        <summary>Add staff</summary>
      <Card action={createStaffMemberAction} as="form" minHeight="none" bodyClassName="form-grid">
        <EqualGrid>
          <div className="ui-field">
            <label htmlFor="staff-name">Name</label>
            <input id="staff-name" name="name" required />
          </div>
          <div className="ui-field">
            <label htmlFor="staff-title">Title</label>
            <input id="staff-title" name="title" placeholder="Photographer, stylist, consultant" />
          </div>
        </EqualGrid>
        <EqualGrid>
          <div className="ui-field">
            <label htmlFor="staff-email">Email</label>
            <input id="staff-email" name="email" type="email" />
          </div>
          <div className="ui-field">
            <label htmlFor="staff-phone">Phone</label>
            <input id="staff-phone" name="phone" />
          </div>
        </EqualGrid>
        <div className="ui-field">
          <label htmlFor="staff-bio">Bio</label>
          <textarea id="staff-bio" name="bio" />
        </div>
        <Switch defaultChecked label="Active for booking" name="isActive" variant="inline" />
        <Button type="submit">
          <Plus size={18} />
          Add staff
        </Button>
      </Card>
      </details>

      <section className="form-grid">
        <h2 className="section-title">Staff roster</h2>
            {staff.map((member) => {
              const needsAvailability = member.isActive && assignedStaffIds.has(member.id) && !staffIdsWithAvailability.has(member.id);
              return (
                  <details key={member.id}>
                    <summary>
                      <strong>{member.name}</strong>{" "}
                      <span className={member.isActive ? "ui-badge ui-badge-success" : "ui-badge ui-badge-danger"}>
                        {member.isActive ? "active" : "inactive"}
                      </span>{" "}
                      {needsAvailability ? <span className="ui-badge ui-badge-warning">no hours set — not bookable</span> : null}
                    </summary>
                    {needsAvailability ?
                      <p className="ui-zero">
                        {member.name} is assigned to a service but has no personal weekly availability rules, so they
                        won&apos;t appear as a bookable option. Add their weekly hours below to make
                        them bookable.
                      </p> :
                      null}
                    <form action={updateStaffMemberAction} className="form-grid ui-zero">
                      <input type="hidden" name="id" value={member.id} />
                      <EqualGrid>
                        <div className="ui-field">
                          <label htmlFor={`staff-${member.id}-name`}>Name</label>
                          <input id={`staff-${member.id}-name`} name="name" defaultValue={member.name} required />
                        </div>
                        <div className="ui-field">
                          <label htmlFor={`staff-${member.id}-title`}>Title</label>
                          <input id={`staff-${member.id}-title`} name="title" defaultValue={member.title} />
                        </div>
                      </EqualGrid>
                      <EqualGrid>
                        <div className="ui-field">
                          <label htmlFor={`staff-${member.id}-email`}>Email</label>
                          <input id={`staff-${member.id}-email`} name="email" type="email" defaultValue={member.email} />
                        </div>
                        <div className="ui-field">
                          <label htmlFor={`staff-${member.id}-phone`}>Phone</label>
                          <input id={`staff-${member.id}-phone`} name="phone" defaultValue={member.phone} />
                        </div>
                      </EqualGrid>
                      <div className="ui-field">
                        <label htmlFor={`staff-${member.id}-bio`}>Bio</label>
                        <textarea id={`staff-${member.id}-bio`} name="bio" defaultValue={member.bio} />
                      </div>
                      <Switch defaultChecked={member.isActive} label="Active for booking" name="isActive" variant="inline" />
                      <Button type="submit" variant="secondary">
                        <Save size={16} />
                        Save staff
                      </Button>
                    </form>
                    {canLinkStaffAccounts ?
                      <form
                        action={linkStaffMemberAdminUserAction}
                        className="form-grid ui-zero">
                        <input type="hidden" name="staffId" value={member.id} />
                        <div className="ui-field ui-zero">
                          <label htmlFor={`staff-${member.id}-admin-link`}>Linked admin account</label>
                          <select id={`staff-${member.id}-admin-link`} name="adminUserId" defaultValue={member.adminUserId || ""}>
                            <option value="">Not linked</option>
                            {adminUsers.map((adminUser) =>
                            <option key={adminUser.id} value={adminUser.id}>
                                {adminUser.email} ({adminUser.role})
                              </option>
                            )}
                          </select>
                        </div>
                        <Button type="submit" variant="secondary">
                          <Link2 size={16} />
                          Update link
                        </Button>
                      </form> :
                      null}
                    <AvailabilityPanel availability={availability.filter(rule => rule.staffId === member.id)} resources={[]} staff={[member]} fixedStaffId={member.id} timezone={timezone} />
                  </details>
              );

            })}
            {!staff.length ?
            <p>No staff members yet. Services can still use business-wide availability.</p> :
            null}
      </section>
    </section>);

}
