import type { Resource } from "@prisma/client";
import { Box, Save } from "lucide-react";
import { createResourceAction, updateResourceAction } from "../actions";

type ResourcesPanelProps = {
  resources: Resource[];
  assignedResourceIds: Set<string>;
  resourceIdsWithAvailability: Set<string>;
};

export function ResourcesPanel({ assignedResourceIds, resources, resourceIdsWithAvailability }: ResourcesPanelProps) {
  return (
    <section className="grid-2">
      <form action={createResourceAction} className="card form-grid">
        <h2 className="section-title">Add resource</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="resource-name">Name</label>
            <input id="resource-name" name="name" placeholder="Studio A" required />
          </div>
          <div className="field">
            <label htmlFor="resource-type">Type</label>
            <input id="resource-type" name="type" placeholder="ROOM, EQUIPMENT, VEHICLE" defaultValue="ROOM" />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="resource-location">Location</label>
            <input id="resource-location" name="location" placeholder="Main studio" />
          </div>
          <div className="field">
            <label htmlFor="resource-capacity">Capacity</label>
            <input id="resource-capacity" name="capacity" type="number" min="1" defaultValue="1" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="resource-description">Description</label>
          <textarea id="resource-description" name="description" />
        </div>
        <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <input name="isActive" type="checkbox" defaultChecked />
          Active
        </label>
        <button className="button" type="submit">
          <Box size={18} />
          Add resource
        </button>
      </form>

      <div className="card">
        <h2 className="section-title">Rooms and equipment</h2>
        <div className="stack">
          {resources.map((resource) => {
            const needsAvailability =
              resource.isActive && assignedResourceIds.has(resource.id) && !resourceIdsWithAvailability.has(resource.id);

            return (
              <details key={resource.id} className="subpanel">
                <summary>
                  <strong>{resource.name}</strong>{" "}
                  <span className={resource.isActive ? "pill success" : "pill danger"}>{resource.isActive ? "active" : "inactive"}</span>{" "}
                  <span className="pill">{resource.type}</span>{" "}
                  {needsAvailability ? <span className="pill warning">no hours set - not bookable</span> : null}
                </summary>
                {needsAvailability ? (
                  <p style={{ color: "var(--muted)", marginBottom: 12 }}>
                    This resource is required by a service but has no weekly resource availability rules. Add hours below before it can be booked.
                  </p>
                ) : null}
                <form action={updateResourceAction} className="form-grid" style={{ marginTop: 12 }}>
                  <input type="hidden" name="id" value={resource.id} />
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor={`resource-${resource.id}-name`}>Name</label>
                      <input id={`resource-${resource.id}-name`} name="name" defaultValue={resource.name} required />
                    </div>
                    <div className="field">
                      <label htmlFor={`resource-${resource.id}-type`}>Type</label>
                      <input id={`resource-${resource.id}-type`} name="type" defaultValue={resource.type} />
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="field">
                      <label htmlFor={`resource-${resource.id}-location`}>Location</label>
                      <input id={`resource-${resource.id}-location`} name="location" defaultValue={resource.location} />
                    </div>
                    <div className="field">
                      <label htmlFor={`resource-${resource.id}-capacity`}>Capacity</label>
                      <input id={`resource-${resource.id}-capacity`} name="capacity" type="number" min="1" defaultValue={resource.capacity} />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor={`resource-${resource.id}-description`}>Description</label>
                    <textarea id={`resource-${resource.id}-description`} name="description" defaultValue={resource.description} />
                  </div>
                  <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                    <input name="isActive" type="checkbox" defaultChecked={resource.isActive} />
                    Active
                  </label>
                  <button className="button" type="submit">
                    <Save size={18} />
                    Save resource
                  </button>
                </form>
              </details>
            );
          })}
          {!resources.length ? <p className="empty-state">No rooms or equipment have been added.</p> : null}
        </div>
      </div>
    </section>
  );
}
