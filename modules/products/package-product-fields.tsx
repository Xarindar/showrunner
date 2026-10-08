"use client";

import { useState } from "react";
import { ProductType } from "@prisma/client";
import { enumLabel } from "@/lib/format";

export function PackageProductFields({ id, initialType, allowance, extraPhotoPriceCents }: {
  id: string;
  initialType: ProductType;
  allowance?: number | null;
  extraPhotoPriceCents?: number | null;
}) {
  const [type, setType] = useState(initialType);
  const [included, setIncluded] = useState(allowance === null || allowance === undefined ? "" : String(allowance));
  const [extraPrice, setExtraPrice] = useState(extraPhotoPriceCents === null || extraPhotoPriceCents === undefined ? "" : (extraPhotoPriceCents / 100).toFixed(2));
  return <>
    <label htmlFor={id}>Type</label>
    <select id={id} name="type" onChange={(event) => setType(event.target.value as ProductType)} value={type}>
      {Object.values(ProductType).map((option) => <option key={option} value={option}>{enumLabel(option)}</option>)}
    </select>
    {type === ProductType.SERVICE_PACKAGE ? <>
      <div className="ui-field">
        <label htmlFor={`${id}-included-photos`}>Included photos (optional)</label>
        <input id={`${id}-included-photos`} inputMode="numeric" max={10000} min={0} name="photoSelectionAllowance" onChange={(event) => setIncluded(event.target.value)} step={1} type="number" value={included} />
      </div>
      <div className="ui-field">
        <label htmlFor={`${id}-extra-photo-price`}>Price per extra photo (optional)</label>
        <input id={`${id}-extra-photo-price`} inputMode="decimal" min={0} name="extraPhotoPrice" onChange={(event) => setExtraPrice(event.target.value)} step="0.01" type="number" value={extraPrice} />
      </div>
      <small className="muted-text">Uses the product currency. Leave blank to configure each client shoot separately. Existing shoot terms are unchanged.</small>
    </> : null}
  </>;
}
