import type { BlockedTime, Resource } from "@prisma/client";
import { Plus, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { createBlockoutAction, deleteBlockoutAction } from "../actions";

type BlockoutsPanelProps = {
  blockouts: Array<BlockedTime & { resource: Resource | null }>;
  resources: Resource[];
  timezone: string;
};

export function BlockoutsPanel({ blockouts, resources, timezone }: BlockoutsPanelProps) {
  return (
    <section className="grid-2">
      <form action={createBlockoutAction} className="card form-grid">
        <h2 style={{ fontSize: "1.35rem" }}>Manual blockout</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="startsAt">Starts</label>
            <input id="startsAt" name="startsAt" type="datetime-local" required />
          </div>
          <div className="field">
            <label htmlFor="endsAt">Ends</label>
            <input id="endsAt" name="endsAt" type="datetime-local" required />
          </div>
        </div>
        <div className="field">
          <label htmlFor="reason">Reason</label>
          <input id="reason" name="reason" placeholder="Vacation, private event, closed" />
        </div>
        <div className="field">
          <label htmlFor="blockout-resource">Resource</label>
          <select id="blockout-resource" name="resourceId" defaultValue="">
            <option value="">All booking</option>
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
              </option>
            ))}
          </select>
        </div>
        <button className="button" type="submit">
          <Plus size={18} />
          Add blockout
        </button>
      </form>

      <div className="card">
        <h2 style={{ fontSize: "1.35rem" }}>Upcoming blockouts</h2>
        <table className="table">
          <tbody>
            {blockouts.map((block) => (
              <tr key={block.id}>
                <td>
                  {formatDateTime(block.startsAt, timezone)}
                  <br />
                  <span style={{ color: "var(--muted)" }}>
                    {block.resource ? `${block.resource.name} - ` : ""}
                    {block.reason || "No reason"}
                  </span>
                </td>
                <td>
                  <form action={deleteBlockoutAction}>
                    <input type="hidden" name="id" value={block.id} />
                    <button className="button secondary" type="submit" title="Delete blockout">
                      <Trash2 size={16} />
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {!blockouts.length ? (
              <tr>
                <td>No blockouts yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
