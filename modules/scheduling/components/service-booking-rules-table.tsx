"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, FileQuestion, Plus, Search, Trash2 } from "lucide-react";
import { Button, Modal, Switch } from "@/components/ui";

type BookingRuleKind = "intake" | "policy";

type BookingRuleOption = {
  kind: BookingRuleKind;
  value: string;
};

type ServiceBookingRulesTableProps = {
  defaultIntakePrompt?: string | null;
  defaultIsActive?: boolean;
  defaultPolicyText?: string | null;
  defaultRequirePolicy?: boolean;
  defaultRequestOnly?: boolean;
  defaultWaitlistEnabled?: boolean;
  idPrefix: string;
  intakeOptions: string[];
  policyOptions: string[];
};

const ruleLabels: Record<BookingRuleKind, { description: string; label: string }> = {
  intake: {
    description: "Customer prompt",
    label: "Intake question"
  },
  policy: {
    description: "Booking copy",
    label: "Booking policy"
  }
};

function normalizeValue(value: string | null | undefined) {
  return (value || "").trim();
}

function normalizedOptions(options: string[]) {
  return Array.from(new Set(options.map((option) => option.trim()).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function matchesSearch(option: BookingRuleOption, searchQuery: string) {
  if (!searchQuery) return true;
  const haystack = `${ruleLabels[option.kind].label} ${option.value}`.toLowerCase();
  return haystack.includes(searchQuery.toLowerCase());
}

function statusLabel(kind: BookingRuleKind, requirePolicy: boolean) {
  if (kind === "policy") return requirePolicy ? "Acceptance required" : "Shown at booking";
  return "Shown at booking";
}

function RuleIcon({ kind }: { kind: BookingRuleKind }) {
  return kind === "policy" ? <ClipboardCheck size={17} /> : <FileQuestion size={17} />;
}

export function ServiceBookingRulesTable({
  defaultIntakePrompt = "",
  defaultIsActive = false,
  defaultPolicyText = "",
  defaultRequirePolicy = false,
  defaultRequestOnly = false,
  defaultWaitlistEnabled = false,
  idPrefix,
  intakeOptions,
  policyOptions
}: ServiceBookingRulesTableProps) {
  const [intakePrompt, setIntakePrompt] = useState(() => normalizeValue(defaultIntakePrompt));
  const [policyText, setPolicyText] = useState(() => normalizeValue(defaultPolicyText));
  const [requirePolicy, setRequirePolicy] = useState(() => Boolean(defaultRequirePolicy && normalizeValue(defaultPolicyText)));
  const [requestOnly, setRequestOnly] = useState(defaultRequestOnly);
  const [waitlistEnabled, setWaitlistEnabled] = useState(defaultWaitlistEnabled);
  const [isActive, setIsActive] = useState(defaultIsActive);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [draftKind, setDraftKind] = useState<BookingRuleKind>("intake");
  const [draftValue, setDraftValue] = useState("");

  const savedOptions = useMemo<BookingRuleOption[]>(
    () => [
      ...normalizedOptions(intakeOptions).map((value) => ({ kind: "intake" as const, value })),
      ...normalizedOptions(policyOptions).map((value) => ({ kind: "policy" as const, value }))
    ],
    [intakeOptions, policyOptions]
  );
  const selectedRows = useMemo<BookingRuleOption[]>(
    () =>
      [
        intakePrompt ? { kind: "intake" as const, value: intakePrompt } : null,
        policyText ? { kind: "policy" as const, value: policyText } : null
      ].filter((row): row is BookingRuleOption => Boolean(row)),
    [intakePrompt, policyText]
  );
  const filteredOptions = useMemo(
    () =>
      savedOptions.filter((option) => {
        if (option.kind === "intake" && option.value === intakePrompt) return false;
        if (option.kind === "policy" && option.value === policyText) return false;
        return matchesSearch(option, searchQuery.trim());
      }),
    [intakePrompt, policyText, savedOptions, searchQuery]
  );

  const closeModal = () => {
    setModalOpen(false);
    setSearchQuery("");
    setDraftValue("");
  };

  const openModal = () => {
    setDraftKind(!intakePrompt ? "intake" : !policyText ? "policy" : "intake");
    setModalOpen(true);
  };

  const applyOption = (kind: BookingRuleKind, value: string) => {
    const nextValue = value.trim();
    if (!nextValue) return;

    if (kind === "intake") {
      setIntakePrompt(nextValue);
    } else {
      setPolicyText(nextValue);
    }

    closeModal();
  };

  const removeRule = (kind: BookingRuleKind) => {
    if (kind === "intake") {
      setIntakePrompt("");
      return;
    }

    setPolicyText("");
    setRequirePolicy(false);
  };

  const saveDraft = () => applyOption(draftKind, draftValue);
  const searchId = `${idPrefix}-booking-rule-search`;
  const draftId = `${idPrefix}-booking-rule-draft`;

  return (
    <div className="service-booking-rules">
      <input name="intakePrompt" type="hidden" value={intakePrompt} />
      <input name="policyText" type="hidden" value={policyText} />

      <div className="booking-rules-toolbar">
        <div>
          <p className="catalog-rail-label">Rules</p>
          <h3>Intake and policy</h3>
        </div>
        <Button onClick={openModal} size="sm" type="button">
          <Plus size={15} />
          Add rule
        </Button>
      </div>

      <div className="catalog-table-scroll booking-rules-table-scroll">
        <table className="catalog-product-table booking-rules-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Option</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {selectedRows.map((row) => (
              <tr key={row.kind}>
                <td>
                  <div className="booking-rule-type-cell">
                    <span className="booking-rule-icon">
                      <RuleIcon kind={row.kind} />
                    </span>
                    <span>
                      <strong>{ruleLabels[row.kind].label}</strong>
                      <small>{ruleLabels[row.kind].description}</small>
                    </span>
                  </div>
                </td>
                <td>
                  <span className="booking-rule-copy" title={row.value}>
                    {row.value}
                  </span>
                </td>
                <td>
                  <span className="catalog-status is-draft">{statusLabel(row.kind, requirePolicy)}</span>
                </td>
                <td>
                  <Button
                    aria-label={`Remove ${ruleLabels[row.kind].label.toLowerCase()}`}
                    className="booking-rule-icon-button"
                    onClick={() => removeRule(row.kind)}
                    size="sm"
                    type="button"
                    variant="ghost">
                    <Trash2 size={15} />
                  </Button>
                </td>
              </tr>
            ))}

            {!selectedRows.length ? (
              <tr className="booking-rules-empty-row">
                <td colSpan={4}>
                  <div className="booking-rules-empty">No intake question or booking policy added</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="studio-toggle-strip booking-rules-toggle-strip">
        <Switch
          checked={requirePolicy}
          disabled={!policyText}
          label="Require policy acceptance"
          name="requirePolicy"
          onChange={(event) => setRequirePolicy(event.currentTarget.checked)}
          variant="inline"
        />
        <Switch
          checked={requestOnly}
          label="Request-only approval"
          name="requestOnly"
          onChange={(event) => setRequestOnly(event.currentTarget.checked)}
          variant="inline"
        />
        <Switch
          checked={waitlistEnabled}
          label="Offer waitlist"
          name="waitlistEnabled"
          onChange={(event) => setWaitlistEnabled(event.currentTarget.checked)}
          variant="inline"
        />
        <Switch
          checked={isActive}
          label="Active"
          name="isActive"
          onChange={(event) => setIsActive(event.currentTarget.checked)}
          variant="inline"
        />
      </div>

      <Modal
        bodyClassName="booking-rule-modal-body"
        className="booking-rule-modal"
        closeLabel="Close booking rule dialog"
        onClose={closeModal}
        open={modalOpen}
        title="Add booking rule">
        <div className="ui-table-filter-search booking-rule-search" role="search">
          <label className="ui-sr-only" htmlFor={searchId}>
            Search saved options
          </label>
          <span className="ui-table-filter-input">
            <Search aria-hidden="true" size={15} />
            <input
              autoComplete="off"
              autoFocus
              id={searchId}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              placeholder="Search intake questions and booking policies"
              value={searchQuery}
            />
          </span>
        </div>

        <div className="booking-rule-option-list">
          {filteredOptions.map((option) => (
            <button
              className="booking-rule-option"
              key={`${option.kind}-${option.value}`}
              onClick={() => applyOption(option.kind, option.value)}
              type="button">
              <span className="catalog-status is-draft">{ruleLabels[option.kind].label}</span>
              <strong>{option.value}</strong>
            </button>
          ))}
          {!filteredOptions.length ? <div className="booking-rule-no-results">No matching saved options</div> : null}
        </div>

        <div className="booking-rule-create-panel">
          <h3>Create new option</h3>
          <div className="booking-rule-kind-toggle" role="group" aria-label="New booking rule type">
            <button
              aria-pressed={draftKind === "intake"}
              className={draftKind === "intake" ? "is-active" : undefined}
              onClick={() => setDraftKind("intake")}
              type="button">
              Intake question
            </button>
            <button
              aria-pressed={draftKind === "policy"}
              className={draftKind === "policy" ? "is-active" : undefined}
              onClick={() => setDraftKind("policy")}
              type="button">
              Booking policy
            </button>
          </div>
          <div className="ui-field">
            <label htmlFor={draftId}>{ruleLabels[draftKind].label}</label>
            <textarea
              id={draftId}
              onChange={(event) => setDraftValue(event.currentTarget.value)}
              placeholder={draftKind === "intake" ? "Anything we should know before your appointment?" : "Please arrive 10 minutes early."}
              value={draftValue}
            />
          </div>
          <div className="module-modal-actions">
            <Button onClick={closeModal} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={!draftValue.trim()} onClick={saveDraft} type="button">
              Add option
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
