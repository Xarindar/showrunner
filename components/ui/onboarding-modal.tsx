"use client";

import { useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { Dialog } from "./dialog";
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
  const titleId = useId();

  const completedThrough =
    completedStepIndex ?? (activeStepIndex === null ? steps.length - 1 : Math.max(-1, activeStepIndex - 1));
  const maxSelectable = maxNavigableStepIndex ?? (activeStepIndex === null ? steps.length - 1 : activeStepIndex);

  return (
    <Dialog
      aria-labelledby={titleId}
      className={cx("ui-dialog", "ui-onboarding-modal", className)}
      onClose={onClose}
      open={open}>
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
            <Button aria-label={closeLabel} className="ui-dialog-close" onClick={onClose} size="sm" type="button" variant="ghost">
              <X size={18} aria-hidden="true" />
            </Button>
          </header>
          <div className="ui-onboarding-body">{open ? children : null}</div>
        </section>
      </div>
    </Dialog>
  );
}
