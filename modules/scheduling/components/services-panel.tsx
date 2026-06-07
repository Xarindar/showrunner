import { Fragment } from "react";
import type { Service } from "@prisma/client";
import { Check, CircleOff, Plus, Save } from "lucide-react";
import { createServiceAction, toggleServiceAction, updateServiceAction } from "../actions";

type ServicesPanelProps = {
  services: Service[];
};

export function ServicesPanel({ services }: ServicesPanelProps) {
  return (
    <section className="grid-2">
      <form action={createServiceAction} className="card form-grid">
        <h2 style={{ fontSize: "1.35rem" }}>Add service</h2>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" required />
        </div>
        <div className="field">
          <label htmlFor="slug">Booking URL slug</label>
          <input id="slug" name="slug" placeholder="consultation" />
          <span style={{ color: "var(--muted)", fontSize: "0.86rem" }}>Leave blank to generate one from the service name.</span>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="durationMinutes">Duration</label>
            <input id="durationMinutes" name="durationMinutes" type="number" min="5" step="5" defaultValue="30" required />
          </div>
          <div className="field">
            <label htmlFor="location">Location</label>
            <input id="location" name="location" placeholder="Online, studio, client location" />
          </div>
        </div>
        <div className="grid-3">
          <div className="field">
            <label htmlFor="minimumNoticeHours">Minimum notice</label>
            <input id="minimumNoticeHours" name="minimumNoticeHours" type="number" min="0" defaultValue="12" />
          </div>
          <div className="field">
            <label htmlFor="maxAdvanceDays">Max advance days</label>
            <input id="maxAdvanceDays" name="maxAdvanceDays" type="number" min="1" defaultValue="60" />
          </div>
          <div className="field">
            <label htmlFor="slotIntervalMinutes">Slot interval</label>
            <input id="slotIntervalMinutes" name="slotIntervalMinutes" type="number" min="5" step="5" defaultValue="30" />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="bufferBeforeMinutes">Buffer before</label>
            <input id="bufferBeforeMinutes" name="bufferBeforeMinutes" type="number" min="0" step="5" defaultValue="0" />
          </div>
          <div className="field">
            <label htmlFor="bufferAfterMinutes">Buffer after</label>
            <input id="bufferAfterMinutes" name="bufferAfterMinutes" type="number" min="0" step="5" defaultValue="15" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" />
        </div>
        <div className="field">
          <label htmlFor="intakePrompt">Intake question</label>
          <input id="intakePrompt" name="intakePrompt" placeholder="What should we know before this appointment?" />
        </div>
        <div className="field">
          <label htmlFor="policyText">Booking policy</label>
          <textarea id="policyText" name="policyText" placeholder="Cancellation, deposit, or preparation policy" />
        </div>
        <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <input name="requirePolicy" type="checkbox" defaultChecked />
          Require policy acceptance
        </label>
        <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <input name="isActive" type="checkbox" defaultChecked />
          Active
        </label>
        <button className="button" type="submit">
          <Plus size={18} />
          Add service
        </button>
      </form>

      <div className="card">
        <h2 style={{ fontSize: "1.35rem" }}>Current services</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <Fragment key={service.id}>
                <tr>
                  <td>
                    <strong>{service.name}</strong>
                    <br />
                    <span style={{ color: "var(--muted)" }}>/book/{service.slug}</span>
                  </td>
                  <td>{service.durationMinutes} min</td>
                  <td>
                    <span className={service.isActive ? "pill success" : "pill danger"}>
                      {service.isActive ? "active" : "inactive"}
                    </span>
                  </td>
                  <td>
                    <form action={toggleServiceAction}>
                      <input type="hidden" name="id" value={service.id} />
                      <input type="hidden" name="isActive" value={service.isActive ? "false" : "true"} />
                      <button className="button secondary" type="submit">
                        {service.isActive ? <CircleOff size={16} /> : <Check size={16} />}
                        {service.isActive ? "Disable" : "Enable"}
                      </button>
                    </form>
                  </td>
                </tr>
                <tr>
                  <td colSpan={4} style={{ color: "var(--muted)", paddingTop: 0 }}>
                    Notice: {service.minimumNoticeHours}h - Advance: {service.maxAdvanceDays}d - Interval:{" "}
                    {service.slotIntervalMinutes}m - Buffer: {service.bufferBeforeMinutes}/{service.bufferAfterMinutes}m
                  </td>
                </tr>
                <tr>
                  <td colSpan={4}>
                    <details>
                      <summary>Edit service</summary>
                      <form action={updateServiceAction} className="form-grid" style={{ marginTop: 12 }}>
                        <input type="hidden" name="id" value={service.id} />
                        <div className="grid-2">
                          <div className="field">
                            <label htmlFor={`service-${service.id}-name`}>Name</label>
                            <input id={`service-${service.id}-name`} name="name" defaultValue={service.name} required />
                          </div>
                          <div className="field">
                            <label htmlFor={`service-${service.id}-location`}>Location</label>
                            <input id={`service-${service.id}-location`} name="location" defaultValue={service.location || ""} />
                          </div>
                        </div>
                        <div className="grid-3">
                          <div className="field">
                            <label htmlFor={`service-${service.id}-duration`}>Duration</label>
                            <input
                              id={`service-${service.id}-duration`}
                              name="durationMinutes"
                              type="number"
                              min="1"
                              step="5"
                              defaultValue={service.durationMinutes}
                              required
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`service-${service.id}-notice`}>Minimum notice</label>
                            <input
                              id={`service-${service.id}-notice`}
                              name="minimumNoticeHours"
                              type="number"
                              min="0"
                              defaultValue={service.minimumNoticeHours}
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`service-${service.id}-advance`}>Max advance days</label>
                            <input
                              id={`service-${service.id}-advance`}
                              name="maxAdvanceDays"
                              type="number"
                              min="1"
                              defaultValue={service.maxAdvanceDays}
                            />
                          </div>
                        </div>
                        <div className="grid-3">
                          <div className="field">
                            <label htmlFor={`service-${service.id}-interval`}>Slot interval</label>
                            <input
                              id={`service-${service.id}-interval`}
                              name="slotIntervalMinutes"
                              type="number"
                              min="1"
                              step="5"
                              defaultValue={service.slotIntervalMinutes}
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`service-${service.id}-before`}>Buffer before</label>
                            <input
                              id={`service-${service.id}-before`}
                              name="bufferBeforeMinutes"
                              type="number"
                              min="0"
                              step="5"
                              defaultValue={service.bufferBeforeMinutes}
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`service-${service.id}-after`}>Buffer after</label>
                            <input
                              id={`service-${service.id}-after`}
                              name="bufferAfterMinutes"
                              type="number"
                              min="0"
                              step="5"
                              defaultValue={service.bufferAfterMinutes}
                            />
                          </div>
                        </div>
                        <div className="field">
                          <label htmlFor={`service-${service.id}-description`}>Description</label>
                          <textarea
                            id={`service-${service.id}-description`}
                            name="description"
                            defaultValue={service.description || ""}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`service-${service.id}-intake`}>Intake question</label>
                          <input
                            id={`service-${service.id}-intake`}
                            name="intakePrompt"
                            defaultValue={service.intakePrompt || ""}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`service-${service.id}-policy`}>Booking policy</label>
                          <textarea id={`service-${service.id}-policy`} name="policyText" defaultValue={service.policyText || ""} />
                        </div>
                        <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                          <input name="requirePolicy" type="checkbox" defaultChecked={service.requirePolicy && Boolean(service.policyText?.trim())} />
                          Require policy acceptance
                        </label>
                        <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
                          <input name="isActive" type="checkbox" defaultChecked={service.isActive} />
                          Active
                        </label>
                        <button className="button" type="submit">
                          <Save size={18} />
                          Save service
                        </button>
                      </form>
                    </details>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
