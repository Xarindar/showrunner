"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { updateBookingStatusAction } from "../actions";

export function AppointmentActions({ bookingId, cancellationReason }: { bookingId: string; cancellationReason: string | null }) {
  const [dialog, setDialog] = useState<"cancel" | null>(null);
  return <>
    <div className="ui-inline-actions" aria-label="Appointment actions">
      <form action={updateBookingStatusAction}>
        <input type="hidden" name="id" value={bookingId} />
        <input type="hidden" name="status" value="COMPLETED" />
        <Button size="sm" type="submit" variant="secondary">Complete</Button>
      </form>
      <form action={updateBookingStatusAction}>
        <input type="hidden" name="id" value={bookingId} />
        <input type="hidden" name="status" value="CONFIRMED" />
        <Button size="sm" type="submit" variant="secondary">Confirm</Button>
      </form>
      <Button size="sm" type="button" variant="danger" onClick={() => setDialog("cancel")}>Cancel</Button>
    </div>
    <Modal open={dialog === "cancel"} title="Cancel appointment" onClose={() => setDialog(null)}>
      <form action={async formData => { await updateBookingStatusAction(formData); setDialog(null); }} className="form-grid">
        <input type="hidden" name="id" value={bookingId} />
        <input type="hidden" name="status" value="CANCELED" />
        <div className="ui-field">
          <label htmlFor="cancellationReason">Reason shared with the customer (optional)</label>
          <textarea id="cancellationReason" name="cancellationReason" defaultValue={cancellationReason || ""} />
        </div>
        <p className="ui-help">This reason is included in the cancellation email.</p>
        <div className="module-modal-actions">
          <Button type="button" variant="ghost" onClick={() => setDialog(null)}>Keep appointment</Button>
          <Button type="submit" variant="danger">Cancel appointment</Button>
        </div>
      </form>
    </Modal>
  </>;
}
