import type { BlockedTime, Resource } from "@prisma/client";
import { Plus, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { createBlockoutAction, deleteBlockoutAction } from "../actions";
import { Button, Card, EqualGrid, Table } from "@/components/ui";

type BlockoutsPanelProps = {
  blockouts: Array<BlockedTime & {resource: Resource | null;}>;
  resources: Resource[];
  timezone: string;
};

export function BlockoutsPanel({ blockouts, resources, timezone }: BlockoutsPanelProps) {
  return (
    <EqualGrid as="section">
      <Card action={createBlockoutAction} as="form" minHeight="none" bodyClassName="form-grid">
        <h2 className="section-title">Manual blockout</h2>
        <EqualGrid>
          <div className="ui-field">
            <label htmlFor="startsAt">Starts</label>
            <input id="startsAt" name="startsAt" type="datetime-local" required />
          </div>
          <div className="ui-field">
            <label htmlFor="endsAt">Ends</label>
            <input id="endsAt" name="endsAt" type="datetime-local" required />
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
          Add blockout
        </Button>
      </Card>

      <Card>
        <h2 className="section-title">Upcoming blockouts</h2>
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
                    <Button type="submit" title="Delete blockout" variant="secondary">
                      <Trash2 size={16} />
                    </Button>
                  </form>
                </td>
              </tr>
            )}
            {!blockouts.length ?
            <tr>
                <td>No blockouts yet.</td>
              </tr> :
            null}
          </tbody>
        </Table>
      </Card>
    </EqualGrid>);

}
