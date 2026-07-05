"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  admitOnePaletteExampleUrl,
  admitOnePaletteRoles,
  getThemePrimaryColor,
  normalizeHexColor,
  normalizeThemeColorValue,
  parseStoredThemePalette,
  parseThemePaletteInput,
  serializeThemePalette
} from "@/lib/theme/palette-url";

type ColorPaletteInputProps = {
  colorInputId: string;
  colorInputName: string;
  defaultValue: string;
  paletteInputId: string;
  paletteInputName: string;
};

export function ColorPaletteInput({
  colorInputId,
  colorInputName,
  defaultValue,
  paletteInputId,
  paletteInputName
}: ColorPaletteInputProps) {
  const normalizedDefault = useMemo(() => normalizeThemeColorValue(defaultValue), [defaultValue]);
  const storedPalette = useMemo(() => parseStoredThemePalette(normalizedDefault), [normalizedDefault]);
  const [paletteInput, setPaletteInput] = useState("");
  const [themeValue, setThemeValue] = useState(normalizedDefault);
  const [colors, setColors] = useState<string[]>(storedPalette?.colors || [getThemePrimaryColor(normalizedDefault)]);

  const importedPalette = parseThemePaletteInput(paletteInput);
  const primaryColor = colors[0] || getThemePrimaryColor(themeValue);
  const hasInvalidPaletteInput = Boolean(paletteInput.trim()) && !importedPalette;
  const status = paletteInput.trim()
    ? importedPalette
      ? `${importedPalette.colors.length} colors ready`
      : "No palette colors found"
    : storedPalette
      ? `${storedPalette.colors.length} saved colors`
      : "";

  function handlePaletteInput(nextValue: string) {
    setPaletteInput(nextValue);

    const parsed = parseThemePaletteInput(nextValue);
    if (!parsed) return;

    setColors(parsed.colors);
    setThemeValue(serializeThemePalette(parsed.colors));
  }

  function handlePrimaryChange(nextValue: string) {
    const nextColor = normalizeHexColor(nextValue);
    if (!nextColor) return;

    const nextColors = colors.length > 1 ? [nextColor, ...colors.slice(1)] : [nextColor];
    setColors(nextColors);
    setThemeValue(nextColors.length > 1 ? serializeThemePalette(nextColors) : nextColor);
  }

  return (
    <div className="ui-palette-input">
      <input name={colorInputName} type="hidden" value={themeValue} />
      <div className="ui-palette-input-controls">
        <div className="ui-field">
          <label htmlFor={paletteInputId}>Admit One palette URL</label>
          <input
            aria-describedby={`${paletteInputId}-status`}
            aria-invalid={hasInvalidPaletteInput || undefined}
            id={paletteInputId}
            name={paletteInputName}
            onChange={(event) => handlePaletteInput(event.currentTarget.value)}
            placeholder={admitOnePaletteExampleUrl}
            value={paletteInput}
          />
        </div>
        <div className="ui-field">
          <label htmlFor={colorInputId}>Primary color</label>
          <span className="ui-color-control">
            <input id={colorInputId} onChange={(event) => handlePrimaryChange(event.currentTarget.value)} type="color" value={primaryColor} />
            <code>{primaryColor}</code>
          </span>
        </div>
      </div>
      <span className={hasInvalidPaletteInput ? "ui-palette-input-status is-error" : "ui-palette-input-status"} id={`${paletteInputId}-status`}>
        {status}
      </span>
      <div aria-label="Theme palette" className="ui-palette-chip-list">
        {colors.map((color, index) => (
          <span className="ui-palette-chip" key={`${color}-${index}`} style={{ "--ui-palette-chip-color": color } as CSSProperties}>
            <span className="ui-palette-chip-swatch" />
            <span className="ui-palette-chip-copy">
              <strong>{admitOnePaletteRoles[index] || `Color ${index + 1}`}</strong>
              <code>{color}</code>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
