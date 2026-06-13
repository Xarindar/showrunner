"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { recordPublicFormStartAction } from "@/modules/forms/actions";
import { computeVisibleFieldIds } from "@/modules/forms/conditional-logic";
import { validateUploadedFile } from "@/modules/forms/upload-fields";
import { normalizeValidationRules, validateFormFieldValue } from "@/modules/forms/validation-rules";

type PublicFormFieldBehavior = {
  conditionalLogic: unknown;
  id: string;
  inputName: string;
  isRequired: boolean;
  label: string;
  pageNumber: number;
  type: string;
  validationRules: unknown;
};

type PublicFormBehaviorProps = {
  enableSteps: boolean;
  formId: string;
  formPath: string;
  fields: PublicFormFieldBehavior[];
  submitButtonLabel: string;
};

function fieldControlValue(form: HTMLFormElement, field: PublicFormFieldBehavior) {
  const controls = Array.from(form.elements).filter(
    (control): control is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement
  );
  const namedControls = controls.filter((control) => control.name === field.inputName);

  if (field.type === "CHECKBOX") {
    return namedControls.some((control) => control instanceof HTMLInputElement && control.checked) ? "yes" : "";
  }

  if (field.type === "RADIO") {
    const checked = namedControls.find((control) => control instanceof HTMLInputElement && control.checked);
    return checked?.value.trim() || "";
  }

  if (field.type === "FILE") {
    const fileControl = namedControls.find((control): control is HTMLInputElement => control instanceof HTMLInputElement && control.type === "file");
    return fileControl?.files?.[0]?.name.trim() || "";
  }

  return namedControls[0]?.value.trim() || "";
}

function setFieldEnabled(wrapper: HTMLElement, enabled: boolean, forceHidden: boolean) {
  wrapper.hidden = forceHidden || !enabled;
  wrapper.setAttribute("aria-hidden", forceHidden || !enabled ? "true" : "false");

  for (const control of Array.from(wrapper.querySelectorAll("input, select, textarea"))) {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) continue;
    if (!control.dataset.originalRequired) control.dataset.originalRequired = control.required ? "true" : "false";

    control.disabled = !enabled;
    control.required = enabled && control.dataset.originalRequired === "true";
    if (!enabled) control.setCustomValidity("");
  }
}

function namedFieldControls(form: HTMLFormElement, field: PublicFormFieldBehavior) {
  return Array.from(form.elements).filter(
    (control): control is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) &&
      control.name === field.inputName
  );
}

function setFieldCustomValidity(form: HTMLFormElement, field: PublicFormFieldBehavior) {
  const controls = namedFieldControls(form, field).filter((control) => !control.disabled);
  const firstControl = controls[0];
  if (!firstControl) return;

  for (const control of controls) control.setCustomValidity("");

  if (field.type === "SIGNATURE") return;

  if (field.type === "FILE") {
    const fileControl = firstControl instanceof HTMLInputElement && firstControl.type === "file" ? firstControl : null;
    const validationMessage = validateUploadedFile({
      fieldLabel: field.label,
      file: fileControl?.files?.[0] || null,
      isRequired: field.isRequired,
      requiredMessage: normalizeValidationRules(field.validationRules).requiredMessage,
      rules: field.validationRules
    });
    firstControl.setCustomValidity(validationMessage);
    return;
  }

  const validationMessage = validateFormFieldValue({
    fieldLabel: field.label,
    isRequired: field.isRequired,
    rules: field.validationRules,
    value: fieldControlValue(form, field)
  });

  firstControl.setCustomValidity(validationMessage);
}

export function PublicFormBehavior({ enableSteps, fields, formId, formPath, submitButtonLabel }: PublicFormBehaviorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const pages = useMemo(
    () => Array.from(new Set(fields.map((field) => Math.max(1, field.pageNumber || 1)))).sort((left, right) => left - right),
    [fields]
  );
  const [currentPage, setCurrentPage] = useState(pages[0] || 1);
  const activePage = pages.includes(currentPage) ? currentPage : pages[0] || 1;
  const currentPageIndex = Math.max(0, pages.indexOf(activePage));
  const hasSteps = enableSteps && pages.length > 1;

  useEffect(() => {
    const container = containerRef.current;
    const formElement = container?.closest("form");
    if (!(formElement instanceof HTMLFormElement)) return;
    const form = formElement;

    function applyVisibility() {
      const values: Record<string, string> = {};
      for (const field of fields) values[field.id] = fieldControlValue(form, field);
      const visibleFieldIds = computeVisibleFieldIds(fields, values);

      for (const field of fields) {
        const wrapper = form.querySelector<HTMLElement>(`[data-form-field-id="${field.id}"]`);
        if (!wrapper) continue;

        const conditionVisible = visibleFieldIds.has(field.id);
        const pageVisible = !hasSteps || field.pageNumber === activePage;
        setFieldEnabled(wrapper, conditionVisible && pageVisible, field.type === "HIDDEN");
        setFieldCustomValidity(form, field);
      }
    }

    function enableVisibleFieldsForSubmit() {
      const values: Record<string, string> = {};
      for (const field of fields) values[field.id] = fieldControlValue(form, field);
      const visibleFieldIds = computeVisibleFieldIds(fields, values);

      for (const field of fields) {
        const wrapper = form.querySelector<HTMLElement>(`[data-form-field-id="${field.id}"]`);
        if (!wrapper) continue;
        setFieldEnabled(wrapper, visibleFieldIds.has(field.id), field.type === "HIDDEN");
        setFieldCustomValidity(form, field);
      }
    }

    function recordStartAndApplyVisibility() {
      if (!startedRef.current) {
        startedRef.current = true;
        void recordPublicFormStartAction(formId, formPath);
      }

      applyVisibility();
    }

    applyVisibility();
    form.addEventListener("input", recordStartAndApplyVisibility);
    form.addEventListener("change", recordStartAndApplyVisibility);
    form.addEventListener("submit", enableVisibleFieldsForSubmit);

    return () => {
      form.removeEventListener("input", recordStartAndApplyVisibility);
      form.removeEventListener("change", recordStartAndApplyVisibility);
      form.removeEventListener("submit", enableVisibleFieldsForSubmit);
    };
  }, [activePage, fields, formId, formPath, hasSteps]);

  function goToNextPage() {
    const form = containerRef.current?.closest("form");
    if (form && !form.reportValidity()) return;
    setCurrentPage(pages[Math.min(pages.length - 1, currentPageIndex + 1)] || activePage);
  }

  if (!hasSteps) {
    return (
      <div ref={containerRef}>
        <button className="button" type="submit">
          {submitButtonLabel}
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="form-grid">
      <div style={{ alignItems: "center", display: "flex", gap: 10, justifyContent: "space-between" }}>
        <span className="pill">
          Step {currentPageIndex + 1} of {pages.length}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="button secondary"
            disabled={currentPageIndex <= 0}
            onClick={() => setCurrentPage(pages[Math.max(0, currentPageIndex - 1)] || activePage)}
            type="button"
          >
            Previous
          </button>
          {currentPageIndex < pages.length - 1 ? (
            <button className="button" onClick={goToNextPage} type="button">
              Next
            </button>
          ) : (
            <button className="button" type="submit">
              {submitButtonLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
