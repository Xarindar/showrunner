import { DateTimeInput } from "@/components/ui/time-input";
import type { BlockedTime, Resource } from "@prisma/client";
import { Plus, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { createBlockoutAction, deleteBlockoutAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

      <Card>
        <h2 className="section-title">Upcoming closures</h2>
        <Table>
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
                <td>No upcoming closures.</td>
              </tr> :
            null}
          </tbody>
        </Table>
      </Card>
      <details><summary>Add closure</summary>
      <Card action={createBlockoutAction} as="form" minHeight="none" bodyClassName="form-grid">

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
      </Card>

      </details>
    </section>);

}
