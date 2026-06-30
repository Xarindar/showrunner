"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { Button, Modal } from "@/components/ui";

const newValue = "__new__";

type ServicePresetFieldProps = {
  defaultValue?: string | null;
  emptyLabel: string;
  id: string;
  label: string;
  name: string;
  newLabel: string;
  newPlaceholder: string;
  options: string[];
};

function normalizedOptions(options: string[]) {
  return Array.from(new Set(options.map((option) => option.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

export function ServicePresetField({
  defaultValue = "",
  emptyLabel,
  id,
  label,
  name,
  newLabel,
  newPlaceholder,
  options
}: ServicePresetFieldProps) {
  const safeOptions = useMemo(() => normalizedOptions(options), [options]);
  const safeDefault = (defaultValue || "").trim();
  const defaultIsPreset = !safeDefault || safeOptions.includes(safeDefault);
  const [customOptions, setCustomOptions] = useState<string[]>(() => (defaultIsPreset || !safeDefault ? [] : [safeDefault]));
  const [selectedValue, setSelectedValue] = useState(safeDefault);
  const [draftValue, setDraftValue] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const selectOptions = useMemo(() => normalizedOptions([...safeOptions, ...customOptions]), [customOptions, safeOptions]);

  const closeModal = () => {
    setModalOpen(false);
    setDraftValue("");
  };

  const saveDraftValue = () => {
    const nextValue = draftValue.trim();
    if (!nextValue) return;
    setCustomOptions((currentOptions) => normalizedOptions([...currentOptions, nextValue]));
    setSelectedValue(nextValue);
    closeModal();
  };

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    saveDraftValue();
  };

  const handleSelectChange = (value: string) => {
    if (value === newValue) {
      setDraftValue("");
      setModalOpen(true);
      return;
    }
    setSelectedValue(value);
  };

  return (
    <div className="ui-field service-preset-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} onChange={(event) => handleSelectChange(event.currentTarget.value)} value={selectedValue}>
        <option value="">{emptyLabel}</option>
        {selectOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value={newValue}>{newLabel}</option>
      </select>
      <input name={name} type="hidden" value={selectedValue} />
      <Modal
        bodyClassName="service-preset-modal-body"
        className="service-preset-modal"
        closeLabel={`Close ${newLabel.toLowerCase()} dialog`}
        onClose={closeModal}
        open={modalOpen}
        title={newLabel}>
        <div className="ui-field">
          <input
            aria-label={newLabel}
            autoComplete="off"
            autoFocus
            id={`${id}-custom`}
            onChange={(event) => setDraftValue(event.currentTarget.value)}
            onKeyDown={handleDraftKeyDown}
            placeholder={newPlaceholder}
            value={draftValue}
          />
        </div>
        <div className="module-modal-actions">
          <Button onClick={closeModal} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={!draftValue.trim()} onClick={saveDraftValue} type="button">
            Add
          </Button>
        </div>
      </Modal>
    </div>
  );
}
