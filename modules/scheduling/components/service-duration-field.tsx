"use client";

import { useMemo, useState } from "react";

const maxDurationMinutes = 24 * 60;

type ServiceDurationFieldProps = {
  defaultMinutes: number;
  idPrefix: string;
  name?: string;
};

function boundedDuration(minutes: number) {
  if (!Number.isFinite(minutes)) return 30;
  return Math.min(maxDurationMinutes, Math.max(1, Math.round(minutes)));
}

function splitDuration(minutes: number) {
  const safeMinutes = boundedDuration(minutes);
  return {
    hours: Math.floor(safeMinutes / 60),
    minutes: safeMinutes % 60
  };
}

function clampInteger(value: string, min: number, max: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

export function ServiceDurationField({ defaultMinutes, idPrefix, name = "durationMinutes" }: ServiceDurationFieldProps) {
  const initialDuration = useMemo(() => splitDuration(defaultMinutes), [defaultMinutes]);
  const [hours, setHours] = useState(initialDuration.hours);
  const [minutes, setMinutes] = useState(initialDuration.minutes);
  const hourInputId = `${idPrefix}-duration-hours`;
  const minuteInputId = `${idPrefix}-duration-minutes`;
  const totalMinutes = boundedDuration(hours * 60 + minutes);

  const handleHoursChange = (value: string) => {
    const nextHours = clampInteger(value, 0, 24);
    setHours(nextHours);
    setMinutes((currentMinutes) => {
      if (nextHours >= 24) return 0;
      if (nextHours === 0 && currentMinutes === 0) return 5;
      return currentMinutes;
    });
  };

  const handleMinutesChange = (value: string) => {
    const nextMinutes = clampInteger(value, 0, 55);
    setMinutes(hours === 0 && nextMinutes === 0 ? 5 : nextMinutes);
  };

  return (
    <fieldset className="ui-field service-duration-field">
      <legend>Service length</legend>
      <div className="service-duration-grid">
        <div className="service-duration-unit">
          <label htmlFor={hourInputId}>Hours</label>
          <input
            id={hourInputId}
            inputMode="numeric"
            max="24"
            min="0"
            onChange={(event) => handleHoursChange(event.currentTarget.value)}
            step="1"
            type="number"
            value={hours}
          />
        </div>
        <div className="service-duration-unit">
          <label htmlFor={minuteInputId}>Minutes</label>
          <input
            id={minuteInputId}
            inputMode="numeric"
            max={hours >= 24 ? "0" : "55"}
            min="0"
            onChange={(event) => handleMinutesChange(event.currentTarget.value)}
            step="5"
            type="number"
            value={minutes}
          />
        </div>
      </div>
      <input name={name} type="hidden" value={totalMinutes} />
    </fieldset>
  );
}
