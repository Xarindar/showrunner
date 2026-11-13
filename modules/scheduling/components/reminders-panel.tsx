import { Bell, Save } from "lucide-react";
import { updateReminderSettingsAction } from "../actions";
import { Button, Switch } from "@/components/ui";

type RemindersPanelProps = {
  enabled: boolean;
  leadMinutes: number;
};

export function RemindersPanel({ enabled, leadMinutes }: RemindersPanelProps) {
  const leadHours = Math.max(1, Math.round(leadMinutes / 60));

  return (
    <section className="studio-panel ui-section-card">
      <div className="ui-section-header"><h2>Booking reminders</h2></div>
      <div className="ui-section-body">
      <form action={updateReminderSettingsAction} className="grid-2">
        <Switch defaultChecked={enabled} label="Email customers before appointments" name="enabled" variant="inline" />
        <div className="ui-field">
          <label htmlFor="bookingReminderLeadHours">Hours before appointment</label>
          <input
            id="bookingReminderLeadHours"
            name="leadHours"
            type="number"
            min="1"
            max="720"
            step="1"
            defaultValue={leadHours}
            required />
          
        </div>
        <Button type="submit">
          <Save size={18} />
          Save reminders
        </Button>
        <div className="ui-badge ui-zero">
          <Bell size={14} />
          {enabled ? `${leadHours}h lead` : "off"}
        </div>
      </form>
      </div>
    </section>);

}
