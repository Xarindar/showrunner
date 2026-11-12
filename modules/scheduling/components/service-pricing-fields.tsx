"use client";

import { useState, type ReactNode } from "react";
import { Field, Select } from "@/components/ui/field";
import type { HourlyRate, AddOnPricingType, PackagePricingType } from "@/lib/scheduling/pricing";
import { HourlyRateEditor } from "./hourly-rates";

export function ServicePricingFields<T extends AddOnPricingType | PackagePricingType>({ pricingType, hourlyRateId, rates, onChange, onRateSaved, priceField, allowPerUnit = false, allowTimeFrame = false }: {
  pricingType: T; hourlyRateId: string; rates: HourlyRate[];
  onChange: (type: T, rateId: string) => void;
  onRateSaved: (rate: HourlyRate) => void;
  priceField?: ReactNode; allowPerUnit?: boolean; allowTimeFrame?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  return <>
    <Field label="Pricing type"><Select aria-label="Pricing type" value={pricingType} onChange={event => onChange(event.target.value as T, hourlyRateId)}><option value="FLAT_RATE">Flat rate</option><option value="HOURLY">Hourly</option>{allowTimeFrame && <option value="TIME_FRAME">Fixed Time Slot</option>}{allowPerUnit && <option value="PER_UNIT">Per unit</option>}</Select></Field>
    {pricingType !== "HOURLY" && priceField}
    {pricingType === "HOURLY" && <Field label="Hourly rate">
      <Select aria-label="Hourly rate" required value={hourlyRateId} onChange={event => {
        if (event.target.value === "__create_rate__") setAdding(true);
        else onChange(pricingType, event.target.value);
      }}>
        <option value="">Choose a rate</option>
        {rates.map(rate => <option key={rate.id} value={rate.id}>{rate.name} — {(rate.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} / hour</option>)}
        <option value="__create_rate__">Create New Rate</option>
      </Select>
    </Field>}
    {adding && <HourlyRateEditor onClose={() => setAdding(false)} onSave={rate => { onRateSaved(rate); onChange(pricingType, rate.id); setAdding(false); }} />}
  </>;
}
