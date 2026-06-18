import type { Resource, Service, StaffMember } from "@prisma/client";
import { Search } from "lucide-react";
import type { SlotDiagnostics } from "@/lib/scheduling/types";
import { Button, Card, EqualGrid, Table } from "@/components/ui";

type SlotDiagnosticsPanelProps = {
  services: Service[];
  resources: Resource[];
  selectedServiceId: string;
  selectedDate: string;
  selectedResourceId: string;
  selectedStaffId: string;
  staff: StaffMember[];
  diagnostics: SlotDiagnostics | null;
};

function reasonSummary(slot: SlotDiagnostics["slots"][number]) {
  if (slot.available) return "Available";
  return slot.reasons.map((reason) => reason.message).join(" ");
}

export function SlotDiagnosticsPanel({
  services,
  resources,
  selectedServiceId,
  selectedDate,
  selectedResourceId,
  selectedStaffId,
  staff,
  diagnostics
}: SlotDiagnosticsPanelProps) {
  const shownSlots = diagnostics?.slots.slice(0, 80) || [];
  const hiddenSlotCount = Math.max(0, (diagnostics?.slots.length || 0) - shownSlots.length);

  return (
    <Card as="section" bodyClassName="ui-stack">
      <div className="page-header flush-header">
        <div>
          <h2 className="section-title">Slot diagnostics</h2>
          <p className="ui-zero">Trace generated openings and the rules blocking unavailable times.</p>
        </div>
      </div>

      <form action="/admin/modules/scheduling" className="subpanel form-grid">
        <EqualGrid min="220px">
          <div className="ui-field">
            <label htmlFor="diagnosticServiceId">Service</label>
            <select id="diagnosticServiceId" name="diagnosticServiceId" defaultValue={selectedServiceId}>
              {services.map((service) =>
              <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              )}
            </select>
          </div>
          <div className="ui-field">
            <label htmlFor="diagnosticStaffId">Staff</label>
            <select id="diagnosticStaffId" name="diagnosticStaffId" defaultValue={selectedStaffId}>
              <option value="">Any assigned staff</option>
              {staff.map((member) =>
              <option key={member.id} value={member.id} disabled={!member.isActive}>
                  {member.name}
                </option>
              )}
            </select>
          </div>
          <div className="ui-field">
            <label htmlFor="diagnosticResourceId">Resource</label>
            <select id="diagnosticResourceId" name="diagnosticResourceId" defaultValue={selectedResourceId}>
              <option value="">Required resources</option>
              {resources.map((resource) =>
              <option key={resource.id} value={resource.id} disabled={!resource.isActive}>
                  {resource.name}
                </option>
              )}
            </select>
          </div>
          <div className="ui-field">
            <label htmlFor="diagnosticDate">Date</label>
            <input id="diagnosticDate" name="diagnosticDate" type="date" defaultValue={selectedDate} required />
          </div>
        </EqualGrid>
        <Button type="submit" variant="secondary">
          <Search size={18} />
          Diagnose slots
        </Button>
      </form>

      {diagnostics ?
      <div className="subpanel">
          <div className="ui-zero">
            <span className="ui-badge">{diagnostics.serviceName}</span>
            {diagnostics.staffName ? <span className="ui-badge">{diagnostics.staffName}</span> : null}
            {diagnostics.resourceNames.length ? <span className="ui-badge">{diagnostics.resourceNames.join(", ")}</span> : null}
            <span className="ui-badge">{diagnostics.ruleCount} rules</span>
            <span className="ui-badge ui-badge-success">{diagnostics.availableCount} available</span>
            <span className="ui-badge">{diagnostics.slotCount} generated</span>
            <span className="ui-badge">{diagnostics.timezone}</span>
          </div>
          {diagnostics.messages.length ?
        <div className="error ui-zero">
              {diagnostics.messages.join(" ")}
            </div> :
        null}
          <Table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Staff</th>
                <th>Resources</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {shownSlots.map((slot) =>
            <tr key={`${slot.startsAt.toISOString()}-${slot.staffId || "global"}`}>
                  <td>{slot.label}</td>
                  <td>{slot.staffName || "Business-wide"}</td>
                  <td>{slot.resourceNames.length ? slot.resourceNames.join(", ") : "None"}</td>
                  <td>
                    <span className={slot.available ? "ui-badge ui-badge-success" : "ui-badge ui-badge-danger"}>
                      {slot.available ? "available" : "blocked"}
                    </span>
                  </td>
                  <td>{reasonSummary(slot)}</td>
                </tr>
            )}
              {!shownSlots.length ?
            <tr>
                  <td colSpan={5}>No slots were generated for this date.</td>
                </tr> :
            null}
            </tbody>
          </Table>
          {hiddenSlotCount ?
        <p className="ui-zero">{hiddenSlotCount} additional slots hidden.</p> :
        null}
        </div> :

      <p className="empty-state">Choose a service and date to diagnose generated slots.</p>
      }
    </Card>);

}
