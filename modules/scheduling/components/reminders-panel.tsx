import { Bell, Save } from "lucide-react";
import { updateReminderSettingsAction } from "../actions";

type RemindersPanelProps = {
  enabled: boolean;
  leadMinutes: number;
};

export function RemindersPanel({ enabled, leadMinutes }: RemindersPanelProps) {
  const leadHours = Math.max(1, Math.round(leadMinutes / 60));

  return (
    <section className="card form-grid">
      <div>
        <p className="eyebrow">Notifications</p>
        <h2 style={{ fontSize: "1.35rem" }}>Booking reminders</h2>
      </div>
      <form action={updateReminderSettingsAction} className="grid-2">
        <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <input name="enabled" type="checkbox" defaultChecked={enabled} />
          Email customers before appointments
        </label>
        <div className="field">
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
        <button className="button" type="submit">
          <Save size={18} />
          Save reminders
        </button>
        <div className="pill" style={{ alignSelf: "center", justifySelf: "start" }}>
          <Bell size={14} />
          {enabled ? `${leadHours}h lead` : "off"}
        </div>
      </form>
    </section>
  );
}
