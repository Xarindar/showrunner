import { Fragment } from "react";
import type { Resource, Service, ServiceResource, ServiceStaff, StaffMember } from "@prisma/client";
import { Check, CircleOff, Save } from "lucide-react";
import { toggleServiceAction, updateServiceAction } from "../actions";
import { Button, ButtonLink, Card, EqualGrid, Switch, Table } from "@/components/ui";

type ServiceWithStaff = Service & {
  resourceAssignments: Array<ServiceResource & {resource: Resource;}>;
  staffAssignments: Array<ServiceStaff & {staff: StaffMember;}>;
};

type ServicesPanelProps = {
  resources: Resource[];
  services: ServiceWithStaff[];
  staff: StaffMember[];
};

function StaffSwitches({
  assignedStaffIds,
  switchIdPrefix,
  staff




}: {assignedStaffIds: string[];staff: StaffMember[];switchIdPrefix: string;}) {
  if (!staff.length) {
    return <p className="ui-zero">Add staff to assign this service to specific people.</p>;
  }

  return (
    <div className="ui-field">
      <label>Staff who can take this service</label>
      <div className="ui-zero">
        {staff.map((member) =>
        <Switch
            id={`${switchIdPrefix}-${member.id}`}
            key={member.id}
            label={member.name}
            name="staffIds"
            value={member.id}
            defaultChecked={assignedStaffIds.includes(member.id)}
            disabled={!member.isActive}
            variant="inline" />
        )}
      </div>
    </div>);

}

function ResourceSwitches({
  assignedResourceIds,
  switchIdPrefix,
  resources




}: {assignedResourceIds: string[];resources: Resource[];switchIdPrefix: string;}) {
  if (!resources.length) {
    return <p className="ui-zero">Add rooms or equipment before requiring resources for a service.</p>;
  }

  return (
    <div className="ui-field">
      <label>Required rooms or equipment</label>
      <div className="ui-zero">
        {resources.map((resource) =>
        <Switch
            id={`${switchIdPrefix}-${resource.id}`}
            key={resource.id}
            label={resource.name}
            name="resourceIds"
            value={resource.id}
            defaultChecked={assignedResourceIds.includes(resource.id)}
            disabled={!resource.isActive}
            variant="inline" />
        )}
      </div>
    </div>);

}

export function ServicesPanel({ resources, services, staff }: ServicesPanelProps) {
  return (
    <EqualGrid as="section">
      <Card><ButtonLink href="/admin/modules/services/new">New session type</ButtonLink></Card>

      <Card>
        <h2 className="section-title">Current services</h2>
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) =>
            <Fragment key={service.id}>
                <tr>
                  <td>
                    <strong>{service.name}</strong>
                    <br />
                    <span className="muted-text">/book/{service.slug}</span>
                  </td>
                  <td>{service.durationMinutes} min</td>
                  <td>
                    <span className={service.isActive ? "ui-badge ui-badge-success" : "ui-badge ui-badge-danger"}>
                      {service.isActive ? "active" : "inactive"}
                    </span>
                    {service.requestOnly ?
                  <>
                        <br />
                        <span className="ui-badge">request-only</span>
                      </> :
                  null}
                    {service.waitlistEnabled ?
                  <>
                        <br />
                        <span className="ui-badge">waitlist</span>
                      </> :
                  null}
                  </td>
                  <td>
                    <form action={toggleServiceAction}>
                      <input type="hidden" name="id" value={service.id} />
                      <input type="hidden" name="isActive" value={service.isActive ? "false" : "true"} />
                      <Button type="submit" variant="secondary">
                        {service.isActive ? <CircleOff size={16} /> : <Check size={16} />}
                        {service.isActive ? "Disable" : "Enable"}
                      </Button>
                    </form>
                  </td>
                </tr>
                <tr>
                  <td className="ui-zero" colSpan={4}>
                    Notice: {service.minimumNoticeHours}h - Advance: {service.maxAdvanceDays}d - Interval:{" "}
                    {service.slotIntervalMinutes}m - Buffer: {service.bufferBeforeMinutes}/{service.bufferAfterMinutes}m
                    <br />
                    Staff:{" "}
                    {service.staffAssignments.length ?
                  service.staffAssignments.map((assignment) => assignment.staff.name).join(", ") :
                  "business-wide availability"}
                    <br />
                    Resources:{" "}
                    {service.resourceAssignments.length ?
                  service.resourceAssignments.map((assignment) => assignment.resource.name).join(", ") :
                  "none required"}
                  </td>
                </tr>
                <tr>
                  <td colSpan={4}>
                    <details>
                      <summary>Edit service</summary>
                      <form action={updateServiceAction} className="form-grid ui-zero">
                        <input type="hidden" name="id" value={service.id} />
                        <EqualGrid>
                          <div className="ui-field">
                            <label htmlFor={`service-${service.id}-name`}>Name</label>
                            <input id={`service-${service.id}-name`} name="name" defaultValue={service.name} required />
                          </div>
                          <div className="ui-field">
                            <label htmlFor={`service-${service.id}-location`}>Location</label>
                            <input id={`service-${service.id}-location`} name="location" defaultValue={service.location || ""} />
                          </div>
                        </EqualGrid>
                        <EqualGrid min="220px">
                          <div className="ui-field">
                            <label htmlFor={`service-${service.id}-duration`}>Duration</label>
                            <input
                            id={`service-${service.id}-duration`}
                            name="durationMinutes"
                            type="number"
                            min="1"
                            step="5"
                            defaultValue={service.durationMinutes}
                            required />
                          
                          </div>
                          <div className="ui-field">
                            <label htmlFor={`service-${service.id}-notice`}>Minimum notice</label>
                            <input
                            id={`service-${service.id}-notice`}
                            name="minimumNoticeHours"
                            type="number"
                            min="0"
                            defaultValue={service.minimumNoticeHours} />
                          
                          </div>
                          <div className="ui-field">
                            <label htmlFor={`service-${service.id}-advance`}>Max advance days</label>
                            <input
                            id={`service-${service.id}-advance`}
                            name="maxAdvanceDays"
                            type="number"
                            min="1"
                            defaultValue={service.maxAdvanceDays} />
                          
                          </div>
                        </EqualGrid>
                        <EqualGrid min="220px">
                          <div className="ui-field">
                            <label htmlFor={`service-${service.id}-interval`}>Slot interval</label>
                            <input
                            id={`service-${service.id}-interval`}
                            name="slotIntervalMinutes"
                            type="number"
                            min="1"
                            step="5"
                            defaultValue={service.slotIntervalMinutes} />
                          
                          </div>
                          <div className="ui-field">
                            <label htmlFor={`service-${service.id}-before`}>Buffer before</label>
                            <input
                            id={`service-${service.id}-before`}
                            name="bufferBeforeMinutes"
                            type="number"
                            min="0"
                            step="5"
                            defaultValue={service.bufferBeforeMinutes} />
                          
                          </div>
                          <div className="ui-field">
                            <label htmlFor={`service-${service.id}-after`}>Buffer after</label>
                            <input
                            id={`service-${service.id}-after`}
                            name="bufferAfterMinutes"
                            type="number"
                            min="0"
                            step="5"
                            defaultValue={service.bufferAfterMinutes} />
                          
                          </div>
                        </EqualGrid>
                        <div className="ui-field">
                          <label htmlFor={`service-${service.id}-description`}>Description</label>
                          <textarea
                          id={`service-${service.id}-description`}
                          name="description"
                          defaultValue={service.description || ""} />
                        
                        </div>
                        <div className="ui-field">
                          <label htmlFor={`service-${service.id}-intake`}>Intake question</label>
                          <input
                          id={`service-${service.id}-intake`}
                          name="intakePrompt"
                          defaultValue={service.intakePrompt || ""} />
                        
                        </div>
                        <div className="ui-field">
                          <label htmlFor={`service-${service.id}-policy`}>Booking policy</label>
                          <textarea id={`service-${service.id}-policy`} name="policyText" defaultValue={service.policyText || ""} />
                        </div>
                        <Switch
                          defaultChecked={service.requirePolicy && Boolean(service.policyText?.trim())}
                          label="Require policy acceptance"
                          name="requirePolicy"
                          variant="inline"
                        />
                        <Switch defaultChecked={service.requestOnly} label="Request-only approval" name="requestOnly" variant="inline" />
                        <Switch defaultChecked={service.waitlistEnabled} label="Offer waitlist when full" name="waitlistEnabled" variant="inline" />
                        <Switch defaultChecked={service.isActive} label="Active" name="isActive" variant="inline" />
                        <StaffSwitches
                        assignedStaffIds={service.staffAssignments.map((assignment) => assignment.staffId)}
                        switchIdPrefix={`service-${service.id}-staff`}
                        staff={staff} />
                      
                        <ResourceSwitches
                        assignedResourceIds={service.resourceAssignments.map((assignment) => assignment.resourceId)}
                        switchIdPrefix={`service-${service.id}-resource`}
                        resources={resources} />
                      
                        <Button type="submit">
                          <Save size={18} />
                          Save service
                        </Button>
                      </form>
                    </details>
                  </td>
                </tr>
              </Fragment>
            )}
          </tbody>
        </Table>
      </Card>
    </EqualGrid>);

}
