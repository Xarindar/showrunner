import type { Service } from "@prisma/client";
import { Search } from "lucide-react";
import type { SlotDiagnostics } from "@/lib/scheduling/types";

type SlotDiagnosticsPanelProps = {
  services: Service[];
  selectedServiceId: string;
  selectedDate: string;
  diagnostics: SlotDiagnostics | null;
};

function reasonSummary(slot: SlotDiagnostics["slots"][number]) {
  if (slot.available) return "Available";
  return slot.reasons.map((reason) => reason.message).join(" ");
}

export function SlotDiagnosticsPanel({
  services,
  selectedServiceId,
  selectedDate,
  diagnostics
}: SlotDiagnosticsPanelProps) {
  const shownSlots = diagnostics?.slots.slice(0, 80) || [];
  const hiddenSlotCount = Math.max(0, (diagnostics?.slots.length || 0) - shownSlots.length);

  return (
    <section className="card stack">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h2 style={{ fontSize: "1.35rem" }}>Slot diagnostics</h2>
          <p style={{ color: "var(--muted)", margin: 0 }}>Trace generated openings and the rules blocking unavailable times.</p>
        </div>
      </div>

      <form action="/admin/modules/scheduling" className="subpanel form-grid">
        <div className="grid-2">
          <div className="field">
            <label htmlFor="diagnosticServiceId">Service</label>
            <select id="diagnosticServiceId" name="diagnosticServiceId" defaultValue={selectedServiceId}>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="diagnosticDate">Date</label>
            <input id="diagnosticDate" name="diagnosticDate" type="date" defaultValue={selectedDate} required />
          </div>
        </div>
        <button className="button secondary" type="submit">
          <Search size={18} />
          Diagnose slots
        </button>
      </form>

      {diagnostics ? (
        <div className="subpanel">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <span className="pill">{diagnostics.serviceName}</span>
            <span className="pill">{diagnostics.ruleCount} rules</span>
            <span className="pill success">{diagnostics.availableCount} available</span>
            <span className="pill">{diagnostics.slotCount} generated</span>
            <span className="pill">{diagnostics.timezone}</span>
          </div>
          {diagnostics.messages.length ? (
            <div className="error" style={{ marginBottom: 12 }}>
              {diagnostics.messages.join(" ")}
            </div>
          ) : null}
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Status</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {shownSlots.map((slot) => (
                <tr key={slot.startsAt.toISOString()}>
                  <td>{slot.label}</td>
                  <td>
                    <span className={slot.available ? "pill success" : "pill danger"}>
                      {slot.available ? "available" : "blocked"}
                    </span>
                  </td>
                  <td>{reasonSummary(slot)}</td>
                </tr>
              ))}
              {!shownSlots.length ? (
                <tr>
                  <td colSpan={3}>No slots were generated for this date.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {hiddenSlotCount ? (
            <p style={{ color: "var(--muted)", marginBottom: 0 }}>{hiddenSlotCount} additional slots hidden.</p>
          ) : null}
        </div>
      ) : (
        <p className="empty-state">Choose a service and date to diagnose generated slots.</p>
      )}
    </section>
  );
}
