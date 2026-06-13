"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computeVisibleFieldIds } from "@/modules/forms/conditional-logic";

type PublicFormFieldBehavior = {
  conditionalLogic: unknown;
  id: string;
  inputName: string;
  pageNumber: number;
  type: string;
};

type PublicFormBehaviorProps = {
  enableSteps: boolean;
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
  }
}

export function PublicFormBehavior({ enableSteps, fields, submitButtonLabel }: PublicFormBehaviorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
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
      }
    }

    applyVisibility();
    form.addEventListener("input", applyVisibility);
    form.addEventListener("change", applyVisibility);
    form.addEventListener("submit", enableVisibleFieldsForSubmit);

    return () => {
      form.removeEventListener("input", applyVisibility);
      form.removeEventListener("change", applyVisibility);
      form.removeEventListener("submit", enableVisibleFieldsForSubmit);
    };
  }, [activePage, fields, hasSteps]);

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
