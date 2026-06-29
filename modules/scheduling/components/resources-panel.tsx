import type { Resource } from "@prisma/client";
import { Box, Save } from "lucide-react";
import { createResourceAction, updateResourceAction } from "../actions";
import { Button, Card, EqualGrid, Switch } from "@/components/ui";

type ResourcesPanelProps = {
  resources: Resource[];
  assignedResourceIds: Set<string>;
  resourceIdsWithAvailability: Set<string>;
};

export function ResourcesPanel({ assignedResourceIds, resources, resourceIdsWithAvailability }: ResourcesPanelProps) {
  return (
    <EqualGrid as="section">
      <Card action={createResourceAction} as="form" minHeight="none" bodyClassName="form-grid">
        <h2 className="section-title">Add resource</h2>
        <EqualGrid>
          <div className="ui-field">
            <label htmlFor="resource-name">Name</label>
            <input id="resource-name" name="name" placeholder="Studio A" required />
          </div>
          <div className="ui-field">
            <label htmlFor="resource-type">Type</label>
            <input id="resource-type" name="type" placeholder="ROOM, EQUIPMENT, VEHICLE" defaultValue="ROOM" />
          </div>
        </EqualGrid>
        <EqualGrid>
          <div className="ui-field">
            <label htmlFor="resource-location">Location</label>
            <input id="resource-location" name="location" placeholder="Main studio" />
          </div>
          <div className="ui-field">
            <label htmlFor="resource-capacity">Capacity</label>
            <input id="resource-capacity" name="capacity" type="number" min="1" defaultValue="1" />
          </div>
        </EqualGrid>
        <div className="ui-field">
          <label htmlFor="resource-description">Description</label>
          <textarea id="resource-description" name="description" />
        </div>
        <Switch defaultChecked label="Active" name="isActive" variant="inline" />
        <Button type="submit">
          <Box size={18} />
          Add resource
        </Button>
      </Card>

      <Card>
        <h2 className="section-title">Rooms and equipment</h2>
        <div className="stack">
          {resources.map((resource) => {
            const needsAvailability =
            resource.isActive && assignedResourceIds.has(resource.id) && !resourceIdsWithAvailability.has(resource.id);

            return (
              <details key={resource.id} className="subpanel">
                <summary>
                  <strong>{resource.name}</strong>{" "}
                  <span className={resource.isActive ? "ui-badge ui-badge-success" : "ui-badge ui-badge-danger"}>{resource.isActive ? "active" : "inactive"}</span>{" "}
                  <span className="ui-badge">{resource.type}</span>{" "}
                  {needsAvailability ? <span className="ui-badge ui-badge-warning">no hours set - not bookable</span> : null}
                </summary>
                {needsAvailability ?
                <p className="ui-zero">
                    This resource is required by a service but has no weekly resource availability rules. Add hours below before it can be booked.
                  </p> :
                null}
                <form action={updateResourceAction} className="form-grid ui-zero">
                  <input type="hidden" name="id" value={resource.id} />
                  <EqualGrid>
                    <div className="ui-field">
                      <label htmlFor={`resource-${resource.id}-name`}>Name</label>
                      <input id={`resource-${resource.id}-name`} name="name" defaultValue={resource.name} required />
                    </div>
                    <div className="ui-field">
                      <label htmlFor={`resource-${resource.id}-type`}>Type</label>
                      <input id={`resource-${resource.id}-type`} name="type" defaultValue={resource.type} />
                    </div>
                  </EqualGrid>
                  <EqualGrid>
                    <div className="ui-field">
                      <label htmlFor={`resource-${resource.id}-location`}>Location</label>
                      <input id={`resource-${resource.id}-location`} name="location" defaultValue={resource.location} />
                    </div>
                    <div className="ui-field">
                      <label htmlFor={`resource-${resource.id}-capacity`}>Capacity</label>
                      <input id={`resource-${resource.id}-capacity`} name="capacity" type="number" min="1" defaultValue={resource.capacity} />
                    </div>
                  </EqualGrid>
                  <div className="ui-field">
                    <label htmlFor={`resource-${resource.id}-description`}>Description</label>
                    <textarea id={`resource-${resource.id}-description`} name="description" defaultValue={resource.description} />
                  </div>
                  <Switch defaultChecked={resource.isActive} label="Active" name="isActive" variant="inline" />
                  <Button type="submit">
                    <Save size={18} />
                    Save resource
                  </Button>
                </form>
              </details>);

          })}
          {!resources.length ? <p className="empty-state">No rooms or equipment have been added.</p> : null}
        </div>
      </Card>
    </EqualGrid>);

}
