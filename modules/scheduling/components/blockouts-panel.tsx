import { DateTimeInput } from "@/components/ui/time-input";
import type { BlockedTime, Resource } from "@prisma/client";
import { Plus, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { createBlockoutAction, deleteBlockoutAction } from "../actions";
import { Button } from "@/components/ui/button";
import { EqualGrid } from "@/components/ui/layout";
import { Table } from "@/components/ui/table";

type BlockoutsPanelProps = {
  blockouts: Array<BlockedTime & {resource: Resource | null;}>;
  resources: Resource[];
  timezone: string;
};

export function BlockoutsPanel({ blockouts, resources, timezone }: BlockoutsPanelProps) {
  return (
    <section className="ui-stack" aria-label="Closures">

      <section className="ui-data-table-shell">
        <div className="ui-data-table-titlebar"><h2>Upcoming closures</h2></div>
        <Table aria-label="Upcoming closures" tableClassName="ui-data-table">
          <thead><tr><th>Closure</th><th>Actions</th></tr></thead>
          <tbody>
            {blockouts.map((block) =>
            <tr key={block.id}>
                <td>
                  {formatDateTime(block.startsAt, timezone)}
                  <br />
                  <span className="muted-text">
                    {block.resource ? `${block.resource.name} - ` : ""}
                    {block.reason || "No reason"}
                  </span>
                </td>
                <td>
                  <form action={deleteBlockoutAction}>
                    <input type="hidden" name="id" value={block.id} />
                    <Button type="submit" title="Remove closure" variant="secondary">
                      <Trash2 size={16} />
                    </Button>
                  </form>
                </td>
              </tr>
            )}
            {!blockouts.length ?
            <tr>
                <td colSpan={2}>No upcoming closures.</td>
              </tr> :
            null}
          </tbody>
        </Table>
      </section>
      <section className="studio-panel ui-section-card"><details><summary className="ui-section-header">Add closure</summary>
      <form action={createBlockoutAction} className="ui-section-body form-grid">

        <EqualGrid>
          <div className="ui-field">
            <label htmlFor="startsAt">Starts</label>
            <DateTimeInput aria-label="Closure start" id="startsAt" name="startsAt"  required />
          </div>
          <div className="ui-field">
            <label htmlFor="endsAt">Ends</label>
            <DateTimeInput aria-label="Closure end" id="endsAt" name="endsAt"  required />
          </div>
        </EqualGrid>
        <div className="ui-field">
          <label htmlFor="reason">Reason</label>
          <input id="reason" name="reason" placeholder="Vacation, private event, closed" />
        </div>
        <div className="ui-field">
          <label htmlFor="blockout-resource">Resource</label>
          <select id="blockout-resource" name="resourceId" defaultValue="">
            <option value="">All booking</option>
            {resources.map((resource) =>
            <option key={resource.id} value={resource.id}>
                {resource.name}
              </option>
            )}
          </select>
        </div>
        <Button type="submit">
          <Plus size={18} />
          Save closure
        </Button>
      </form>

      </details></section>
    </section>);

}
