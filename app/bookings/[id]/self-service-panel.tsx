"use client";

import { useActionState, useEffect, useState } from "react";
import { Ban, CalendarClock } from "lucide-react";
import {
  cancelSelfServiceBookingAction,
  rescheduleSelfServiceBookingAction,
  type SelfServiceActionState
} from "./actions";

type Slot = {
  startsAt: string;
  endsAt: string;
  label: string;
  resourceIds: string[];
  resourceNames: string[];
  staffId: string;
  staffName: string;
};

type SelfServicePanelProps = {
  bookingId: string;
  canManage: boolean;
  defaultDate: string;
  token: string;
};

const initialState: SelfServiceActionState = {};

export function SelfServicePanel({ bookingId, canManage, defaultDate, token }: SelfServicePanelProps) {
  const [rescheduleState, rescheduleAction, reschedulePending] = useActionState(rescheduleSelfServiceBookingAction, initialState);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelSelfServiceBookingAction, initialState);
  const [date, setDate] = useState(defaultDate);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(canManage);

  useEffect(() => {
    if (!canManage || !date) return;

    let active = true;
    const params = new URLSearchParams({ date, token });
    fetch(`/bookings/${encodeURIComponent(bookingId)}/availability?${params.toString()}`)
      .then((response) => (response.ok ? response.json() : { slots: [] }))
      .then((data: { slots: Slot[] }) => {
        if (!active) return;
        setSlots(data.slots);
        setSelectedSlot(data.slots[0]?.startsAt || "");
      })
      .catch(() => {
        if (active) setSlots([]);
      })
      .finally(() => {
        if (active) setLoadingSlots(false);
      });

    return () => {
      active = false;
    };
  }, [bookingId, canManage, date, token]);

  return (
    <div className="card form-grid">
      <h2 className="section-title">Manage appointment</h2>
      {!canManage ? <p>This appointment can no longer be changed online.</p> : null}

      {canManage ? (
        <form action={rescheduleAction} className="form-grid">
          <input name="bookingId" type="hidden" value={bookingId} />
          <input name="token" type="hidden" value={token} />
          <input name="startsAt" type="hidden" value={selectedSlot} />
          <div className="field">
            <label htmlFor="selfServiceDate">New date</label>
            <input
              id="selfServiceDate"
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setLoadingSlots(true);
                setSelectedSlot("");
                setSlots([]);
              }}
            />
          </div>
          <div className="slot-panel" aria-busy={loadingSlots}>
            {loadingSlots ? <p>Loading available times...</p> : null}
            {!loadingSlots && !slots.length ? <p>No times are available for this date.</p> : null}
            {!loadingSlots && slots.length ? (
              <div className="time-slot-grid">
                {slots.map((slot) => (
                  <button
                    className={slot.startsAt === selectedSlot ? "time-slot selected" : "time-slot"}
                    key={`${slot.startsAt}-${slot.staffId}-${slot.resourceIds.join("-")}`}
                    onClick={() => setSelectedSlot(slot.startsAt)}
                    type="button"
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {rescheduleState.error ? <div className="error">{rescheduleState.error}</div> : null}
          <button className="button" disabled={reschedulePending || !selectedSlot} type="submit">
            <CalendarClock size={18} />
            Reschedule
          </button>
        </form>
      ) : null}

      {canManage ? (
        <form action={cancelAction} className="form-grid">
          <input name="bookingId" type="hidden" value={bookingId} />
          <input name="token" type="hidden" value={token} />
          <div className="field">
            <label htmlFor="cancellationReason">Cancellation reason</label>
            <textarea id="cancellationReason" name="cancellationReason" />
          </div>
          {cancelState.error ? <div className="error">{cancelState.error}</div> : null}
          <button className="button danger" disabled={cancelPending} type="submit">
            <Ban size={18} />
            Cancel appointment
          </button>
        </form>
      ) : null}
    </div>
  );
}
