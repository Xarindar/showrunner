"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cx } from "./utils";

export type OnboardingModalStep = {
  id: string;
  label: string;
  title?: string;
};

type OnboardingModalProps = {
  activeStepIndex: number | null;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  completedStepIndex?: number;
  description?: ReactNode;
  maxNavigableStepIndex?: number;
  onClose: () => void;
  onStepSelect?: (index: number) => void;
  open: boolean;
  steps: OnboardingModalStep[];
  title: ReactNode;
};

export function OnboardingModal({
  activeStepIndex,
  children,
  className,
  closeLabel = "Close onboarding",
  completedStepIndex,
  description,
  maxNavigableStepIndex,
  onClose,
  onStepSelect,
  open,
  steps,
  title
}: OnboardingModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  const completedThrough =
    completedStepIndex ?? (activeStepIndex === null ? steps.length - 1 : Math.max(-1, activeStepIndex - 1));
  const maxSelectable = maxNavigableStepIndex ?? (activeStepIndex === null ? steps.length - 1 : activeStepIndex);

  return (
    <dialog
      aria-labelledby={titleId}
      className={cx("ui-dialog", "ui-onboarding-modal", className)}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      ref={ref}>
      <div className="ui-onboarding-shell">
        <aside className="ui-onboarding-rail" aria-label="Onboarding progress">
          <ol className="ui-onboarding-steps">
            {steps.map((step, index) => {
              const current = activeStepIndex === index;
              const complete = !current && index <= completedThrough;
              const selectable = Boolean(onStepSelect) && index <= maxSelectable;
              return (
                <li className="ui-onboarding-step-item" key={step.id}>
                  <button
                    aria-current={current ? "step" : undefined}
                    aria-label={`${step.title || step.label}${current ? ", current step" : complete ? ", completed" : ""}`}
                    className={cx(
                      "ui-onboarding-step-control",
                      current && "is-current",
                      complete && "is-complete",
                      !current && !complete && "is-pending"
                    )}
                    disabled={!selectable}
                    onClick={() => {
                      if (selectable) onStepSelect?.(index);
                    }}
                    title={step.title}
                    type="button">
                    {step.label}
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="ui-onboarding-content">
          <header className="ui-onboarding-header">
            <div>
              <h2 className="ui-zero" id={titleId}>
                {title}
              </h2>
              {description ? <p>{description}</p> : null}
            </div>
            <button aria-label={closeLabel} className="ui-onboarding-close" onClick={onClose} type="button">
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className="ui-onboarding-body">{open ? children : null}</div>
        </section>
      </div>
    </dialog>
  );
}
