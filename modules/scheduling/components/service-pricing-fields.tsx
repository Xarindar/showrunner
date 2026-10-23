"use client";

import { useState } from "react";
import { Button, Field, Select } from "@/components/ui";
import type { HourlyRate, PricingType } from "@/lib/scheduling/pricing";
import { HourlyRateEditor } from "./hourly-rates";

export function ServicePricingFields({ pricingType, hourlyRateId, rates, onChange, onRateSaved }: {
  pricingType: PricingType; hourlyRateId: string; rates: HourlyRate[];
  onChange: (type: PricingType, rateId: string) => void;
  onRateSaved: (rate: HourlyRate) => void;
}) {
  const [adding, setAdding] = useState(false);
  const selectedRate = rates.find(rate => rate.id === hourlyRateId);
  return <>
    <Field label="Pricing type"><Select aria-label="Pricing type" value={pricingType} onChange={event => onChange(event.target.value as PricingType, hourlyRateId)}><option value="FLAT_RATE">Flat rate</option><option value="HOURLY">Hourly</option></Select></Field>
    {pricingType === "HOURLY" && <div className="hourly-rate-field">
      <Field label="Hourly rate" hint={selectedRate ? `${selectedRate.name} · $${(selectedRate.amountCents / 100).toFixed(2)} / hour` : undefined}><Select aria-label="Hourly rate" required value={hourlyRateId} onChange={event => onChange(pricingType, event.target.value)}><option value="">Choose a rate</option>{rates.map(rate => <option key={rate.id} value={rate.id}>{rate.name} — {(rate.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} / hour</option>)}</Select></Field>
      <Button type="button" variant="ghost" onClick={() => setAdding(true)}>Add rate</Button>
    </div>}
    {adding && <HourlyRateEditor onClose={() => setAdding(false)} onSave={rate => { onRateSaved(rate); onChange(pricingType, rate.id); setAdding(false); }} />}
  </>;
}
