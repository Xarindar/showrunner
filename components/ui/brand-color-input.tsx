"use client";

import { useState } from "react";
import { normalizeThemePrimary } from "@/lib/theme/tokens";

type BrandColorInputProps = {
  defaultValue: string;
  id: string;
  name: string;
};

export function BrandColorInput({ defaultValue, id, name }: BrandColorInputProps) {
  const [color, setColor] = useState(() => normalizeThemePrimary(defaultValue));

  return (
    <div className="ui-field">
      <label htmlFor={id}>Brand color</label>
      <span className="ui-color-control">
        <input
          id={id}
          name={name}
          onChange={(event) => setColor(event.currentTarget.value)}
          type="color"
          value={color}
        />
        <code>{color}</code>
      </span>
      <small className="ui-field-hint">Used for the logo mark, primary actions, focus, and progress.</small>
    </div>
  );
}
