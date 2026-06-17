import { Bell, Save } from "lucide-react";
import { updateReminderSettingsAction } from "../actions";

type RemindersPanelProps = {
  enabled: boolean;
  leadMinutes: number;
};

export function RemindersPanel({ enabled, leadMinutes }: RemindersPanelProps) {
  const leadHours = Math.max(1, Math.round(leadMinutes / 60));

  return (
    <section className="ui-card ui-card-density-normal ui-card-min-none form-grid">
      <div>
        <p className="eyebrow">Notifications</p>
        <h2 className="section-title">Booking reminders</h2>
      </div>
      <form action={updateReminderSettingsAction} className="grid-2">
        <label className="ui-zero">
          <input name="enabled" type="checkbox" defaultChecked={enabled} />
          Email customers before appointments
        </label>
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
            required
          />
        </div>
        <button className="ui-button" type="submit">
          <Save size={18} />
          Save reminders
        </button>
        <div className="ui-badge ui-zero">
          <Bell size={14} />
          {enabled ? `${leadHours}h lead` : "off"}
        </div>
      </form>
    </section>
  );
}
