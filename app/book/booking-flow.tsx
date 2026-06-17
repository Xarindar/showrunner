"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { CalendarCheck, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, FileText, MapPin } from "lucide-react";
import { slugify } from "@/lib/slug";
import { createPublicBookingAction, joinPublicWaitlistAction, type BookingFormState, type WaitlistFormState } from "./actions";

type BookableService = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  location: string | null;
  intakePrompt: string | null;
  policyText: string | null;
  requirePolicy: boolean;
  requestOnly: boolean;
  waitlistEnabled: boolean;
  staff: Array<{
    id: string;
    name: string;
    title: string;
  }>;
  resources: Array<{
    id: string;
    name: string;
    type: string;
  }>;
};

type Slot = {
  startsAt: string;
  endsAt: string;
  label: string;
  resourceIds: string[];
  resourceNames: string[];
  staffId: string;
  staffName: string;
};

type BookingFlowProps = {
  services: BookableService[];
  defaultDate: string;
  initialServiceSlug?: string;
};

type Step = "service" | "time" | "details" | "review";
type TransitionDirection = "forward" | "back";

const initialState: BookingFormState = {};
const initialWaitlistState: WaitlistFormState = {};
const steps: Array<{ id: Step; label: string }> = [
  { id: "service", label: "Service" },
  { id: "time", label: "Time" },
  { id: "details", label: "Details" },
  { id: "review", label: "Review" }
];

function slotKey(slot: Slot) {
  return `${slot.startsAt}|${slot.staffId || ""}|${slot.resourceIds.join(",")}`;
}

export function BookingFlow({ services, defaultDate, initialServiceSlug }: BookingFlowProps) {
  const initialService =
    services.find((service) => service.slug === initialServiceSlug) || services.find((service) => service.id === initialServiceSlug) || services[0];
  const [state, action, pending] = useActionState(createPublicBookingAction, initialState);
  const [waitlistState, waitlistAction, waitlistPending] = useActionState(joinPublicWaitlistAction, initialWaitlistState);
  const [step, setStep] = useState<Step>("service");
  const [transitionDirection, setTransitionDirection] = useState<TransitionDirection>("forward");
  const [serviceId, setServiceId] = useState(initialService?.id || "");
  const [staffFilterId, setStaffFilterId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [intakeResponse, setIntakeResponse] = useState("");
  const [policyAccepted, setPolicyAccepted] = useState(false);

  const selectedService = useMemo(
    () => services.find((service) => service.id === serviceId) || services[0],
    [serviceId, services]
  );
  const selectedSlotDetails = slots.find((slot) => slotKey(slot) === selectedSlot);
  const canJoinWaitlist = Boolean(selectedService?.waitlistEnabled && !loadingSlots && !slots.length);
  const stepIndex = steps.findIndex((item) => item.id === step);
  const detailsReady = customerName.trim().length > 1 && customerEmail.includes("@");
  const reviewReady = Boolean(selectedService && detailsReady && (selectedSlotDetails || canJoinWaitlist));
  const requiresPolicyAcceptance = Boolean(selectedService?.requirePolicy && selectedService.policyText?.trim());
  const panelClass = `booking-card booking-step-panel ${transitionDirection}`;
  const submitting = pending || waitlistPending;

  useEffect(() => {
    if (!serviceId || !date) return;

    let active = true;

    const params = new URLSearchParams({ serviceId, date });
    if (staffFilterId) params.set("staffId", staffFilterId);

    fetch(`/api/availability?${params.toString()}`)
      .then((response) => response.json())
      .then((data: { slots: Slot[] }) => {
        if (!active) return;
        setSlots(data.slots);
        setSelectedSlot(data.slots[0] ? slotKey(data.slots[0]) : "");
      })
      .catch(() => {
        if (active) setSlots([]);
      })
      .finally(() => {
        if (active) setLoadingSlots(false);
      });

    return () => {
      active = false;
    };
  }, [serviceId, staffFilterId, date]);

  if (!services.length) {
    return <div className="booking-card">No services are available yet.</div>;
  }

  if (state.ok || waitlistState.ok) {
    const isWaitlist = Boolean(waitlistState.ok);
    const isRequest = state.status === "PENDING";
    return (
      <div className="booking-complete">
        <div className="booking-complete-icon">
          <Check size={34} />
        </div>
        <p className="eyebrow">{isWaitlist ? "Waitlisted" : isRequest ? "Requested" : "Booked"}</p>
        <h1>{isWaitlist ? "You're on the waitlist." : isRequest ? "Your appointment request is in." : "Your appointment is booked."}</h1>
        <p className="lead">
          {isWaitlist
            ? "The business will follow up if a time opens for your selected date."
            : isRequest
              ? "Check your email for request details. The business will approve or follow up if anything needs to change."
              : "Check your email for confirmation details. The business will follow up if anything needs to change."}
        </p>
        {!isWaitlist && state.calendarUrl ? (
          <a className="ui-button ui-button-secondary" href={state.calendarUrl}>
            <CalendarDays size={18} />
            Add to calendar
          </a>
        ) : null}
        {!isWaitlist && state.manageUrl ? (
          <a className="ui-button" href={state.manageUrl}>
            <CalendarCheck size={18} />
            Manage appointment
          </a>
        ) : null}
        {state.formLinks?.length ? (
          <div className="subpanel form-grid ui-zero">
            <h2 className="ui-zero">Appointment forms</h2>
            {state.formLinks.map((formLink) => (
              <a className={formLink.isRequired ? "ui-button" : "ui-button ui-button-secondary"} href={formLink.href} key={formLink.href}>
                <FileText size={18} />
                {formLink.isRequired ? "Required: " : ""}
                {formLink.name}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function goToStep(nextStep: Step) {
    const nextIndex = steps.findIndex((item) => item.id === nextStep);
    if (nextIndex < 0 || nextStep === step) return;

    setTransitionDirection(nextIndex > stepIndex ? "forward" : "back");
    setStep(nextStep);
  }

  function goNext() {
    if (step === "service") goToStep("time");
    if (step === "time" && (selectedSlot || canJoinWaitlist)) goToStep("details");
    if (step === "details" && detailsReady) goToStep("review");
  }

  function goBack() {
    if (step === "review") goToStep("details");
    if (step === "details") goToStep("time");
    if (step === "time") goToStep("service");
  }

  function selectService(service: BookableService) {
    const serviceSlug = service.slug || slugify(service.name);

    setLoadingSlots(true);
    setSelectedSlot("");
    setServiceId(service.id);
    setStaffFilterId("");

    window.history.replaceState({}, "", `/book/${serviceSlug}`);
  }

  return (
    <div className="booking-flow">
      <section className="booking-main">
        <div className="booking-progress" aria-label="Booking progress">
          {steps.map((item, index) => (
            <button
              className={index <= stepIndex ? "booking-progress-step active" : "booking-progress-step"}
              disabled={index > stepIndex}
              key={item.id}
              onClick={() => goToStep(item.id)}
              type="button"
            >
              <span>{index + 1}</span>
              {item.label}
            </button>
          ))}
        </div>

        {state.error || waitlistState.error ? <div className="error">{state.error || waitlistState.error}</div> : null}

        {step === "service" ? (
          <div className={panelClass}>
            <p className="eyebrow">Step 1</p>
            <h2>What would you like to book?</h2>
            <div className="service-choice-grid">
              {services.map((service) => (
                <button
                  className={service.id === serviceId ? "service-choice selected" : "service-choice"}
                  key={service.id}
                  onClick={() => selectService(service)}
                  type="button"
                >
                  <span className="service-choice-name">{service.name}</span>
                  <span>{service.description || "Book a focused appointment."}</span>
                  <span className="service-choice-meta">
                    <Clock size={16} />
                    {service.durationMinutes} min
                    {service.location ? (
                      <>
                        <MapPin size={16} />
                        {service.location}
                      </>
                    ) : null}
                  </span>
                  {service.requestOnly || service.waitlistEnabled ? (
                    <span className="service-choice-meta">
                      {service.requestOnly ? "Approval required" : ""}
                      {service.requestOnly && service.waitlistEnabled ? " | " : ""}
                      {service.waitlistEnabled ? "Waitlist available" : ""}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="booking-actions">
              <button className="ui-button" onClick={goNext} type="button">
                Continue
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        ) : null}

        {step === "time" ? (
          <div className={panelClass}>
            <p className="eyebrow">Step 2</p>
            <h2>Choose a day and time.</h2>
            <div className="date-picker-row">
              <label htmlFor="bookingDate">Date</label>
              <input
                id="bookingDate"
                type="date"
                value={date}
                onChange={(event) => {
                  setLoadingSlots(true);
                  setSelectedSlot("");
                  setDate(event.target.value);
                }}
              />
            </div>
            {selectedService?.staff.length ? (
              <div className="date-picker-row">
                <label htmlFor="staffFilterId">Staff</label>
                <select
                  id="staffFilterId"
                  value={staffFilterId}
                  onChange={(event) => {
                    setLoadingSlots(true);
                    setSelectedSlot("");
                    setStaffFilterId(event.target.value);
                  }}
                >
                  <option value="">Any available staff</option>
                  {selectedService.staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                      {member.title ? `, ${member.title}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="slot-panel" aria-busy={loadingSlots}>
              {loadingSlots ? (
                <div className="skeleton-stack" aria-label="Loading available times">
                  {Array.from({ length: 5 }, (_, index) => (
                    <div className="skeleton-row" key={index}>
                      <span className="skeleton-dot" />
                      <span className="skeleton-line long" />
                      <span className="skeleton-line medium" />
                    </div>
                  ))}
                </div>
              ) : null}
              {!loadingSlots && !slots.length ? (
                <div className="empty-state">
                  <CalendarDays size={24} />
                  <p>
                    {selectedService?.waitlistEnabled
                      ? "No times are available for this date. Continue to join the waitlist."
                      : "No times are available for this date. Try another day."}
                  </p>
                </div>
              ) : null}
              {!loadingSlots && slots.length ? (
                <div className="time-slot-grid">
                  {slots.map((slot) => (
                    <button
                      className={slotKey(slot) === selectedSlot ? "time-slot selected" : "time-slot"}
                      key={slotKey(slot)}
                      onClick={() => setSelectedSlot(slotKey(slot))}
                      type="button"
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="booking-actions">
              <button className="ui-button ui-button-secondary" onClick={goBack} type="button">
                <ChevronLeft size={18} />
                Back
              </button>
              <button className="ui-button" disabled={!selectedSlot && !canJoinWaitlist} onClick={goNext} type="button">
                {canJoinWaitlist && !selectedSlot ? "Join waitlist" : "Continue"}
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        ) : null}

        {step === "details" ? (
          <div className={panelClass}>
            <p className="eyebrow">Step 3</p>
            <h2>Tell us who is coming.</h2>
            <div className="booking-detail-fields">
              <div className="ui-field">
                <label htmlFor="customerName">Name</label>
                <input id="customerName" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
              </div>
              <div className="ui-field">
                <label htmlFor="customerEmail">Email</label>
                <input
                  id="customerEmail"
                  type="email"
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                />
              </div>
              <div className="ui-field">
                <label htmlFor="customerPhone">Phone</label>
                <input id="customerPhone" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
              </div>
              <div className="ui-field">
                <label htmlFor="notes">Anything else?</label>
                <textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </div>
              {selectedService?.intakePrompt ? (
                <div className="ui-field">
                  <label htmlFor="intakeResponse">{selectedService.intakePrompt}</label>
                  <textarea
                    id="intakeResponse"
                    value={intakeResponse}
                    onChange={(event) => setIntakeResponse(event.target.value)}
                  />
                </div>
              ) : null}
            </div>
            <div className="booking-actions">
              <button className="ui-button ui-button-secondary" onClick={goBack} type="button">
                <ChevronLeft size={18} />
                Back
              </button>
              <button className="ui-button" disabled={!detailsReady} onClick={goNext} type="button">
                Review
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        ) : null}

        {step === "review" ? (
          <form action={selectedSlotDetails ? action : waitlistAction} className={panelClass}>
            <input className="ui-zero"
              aria-hidden="true"
              autoComplete="off"
              name="companyWebsite"
             
              tabIndex={-1}
              type="text"
            />
            <input name="serviceId" type="hidden" value={selectedService?.id || ""} />
            <input name="staffId" type="hidden" value={selectedSlotDetails?.staffId || (!selectedSlotDetails ? staffFilterId : "")} />
            <input name="resourceIds" type="hidden" value={selectedSlotDetails?.resourceIds.join(",") || ""} />
            <input name="startsAt" type="hidden" value={selectedSlotDetails?.startsAt || ""} />
            <input name="desiredDate" type="hidden" value={date} />
            <input name="customerName" type="hidden" value={customerName} />
            <input name="customerEmail" type="hidden" value={customerEmail} />
            <input name="customerPhone" type="hidden" value={customerPhone} />
            <input name="notes" type="hidden" value={notes} />
            <input name="intakeResponse" type="hidden" value={intakeResponse} />

            <p className="eyebrow">Step 4</p>
            <h2>{selectedSlotDetails ? "Review and request your appointment." : "Review and join the waitlist."}</h2>
            <div className="review-list">
              <div>
                <span>Service</span>
                <strong>{selectedService?.name}</strong>
              </div>
              <div>
                <span>{selectedSlotDetails ? "Time" : "Waitlist date"}</span>
                <strong>{selectedSlotDetails ? `${date} at ${selectedSlotDetails.label}` : date}</strong>
              </div>
              {selectedSlotDetails?.staffName ? (
                <div>
                  <span>Staff</span>
                  <strong>{selectedSlotDetails.staffName}</strong>
                </div>
              ) : null}
              {selectedSlotDetails?.resourceNames.length ? (
                <div>
                  <span>Resources</span>
                  <strong>{selectedSlotDetails.resourceNames.join(", ")}</strong>
                </div>
              ) : null}
              <div>
                <span>Name</span>
                <strong>{customerName}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{customerEmail}</strong>
              </div>
            </div>

            {selectedService?.policyText ? (
              <label className="policy-check">
                <input
                  checked={policyAccepted}
                  name="policyAccepted"
                  onChange={(event) => setPolicyAccepted(event.target.checked)}
                  required={selectedService.requirePolicy}
                  type="checkbox"
                />
                <span>{selectedService.policyText}</span>
              </label>
            ) : null}

            <div className="booking-actions">
              <button className="ui-button ui-button-secondary" onClick={goBack} type="button">
                <ChevronLeft size={18} />
                Back
              </button>
              <button
                className="ui-button"
                aria-busy={submitting}
                disabled={submitting || !reviewReady || (requiresPolicyAcceptance && !policyAccepted)}
                type="submit"
              >
                <CalendarCheck size={18} />
                {selectedSlotDetails
                  ? selectedService?.requestOnly
                    ? "Request appointment"
                    : "Book appointment"
                  : "Join waitlist"}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <footer className="booking-footer-summary">
        <div className="summary-kicker">
          <CalendarCheck size={18} />
          Appointment summary
        </div>
        <dl>
          <div>
            <dt>Service</dt>
            <dd className="summary-value" key={selectedService?.name || "service-empty"}>
              {selectedService?.name || "Choose a service"}
            </dd>
          </div>
          <div>
            <dt>When</dt>
            <dd className="summary-value" key={selectedSlotDetails ? `${date}-${selectedSlotDetails.startsAt}` : "time-empty"}>
              {selectedSlotDetails ? `${date} at ${selectedSlotDetails.label}` : "Choose a time"}
            </dd>
          </div>
          <div>
            <dt>Staff</dt>
            <dd className="summary-value" key={selectedSlotDetails?.staffId || "staff-empty"}>
              {selectedSlotDetails?.staffName || (selectedService?.staff.length ? "Any available staff" : "Assigned after booking")}
            </dd>
          </div>
          <div>
            <dt>Resources</dt>
            <dd className="summary-value" key={selectedSlotDetails?.resourceIds.join("-") || "resources-empty"}>
              {selectedSlotDetails?.resourceNames.length
                ? selectedSlotDetails.resourceNames.join(", ")
                : selectedService?.resources.length
                  ? selectedService.resources.map((resource) => resource.name).join(", ")
                  : "No dedicated resource"}
            </dd>
          </div>
          <div>
            <dt>Where</dt>
            <dd className="summary-value" key={selectedService?.location || "location-empty"}>
              {selectedService?.location || "Location shared after booking"}
            </dd>
          </div>
          <div>
            <dt>Contact</dt>
            <dd className="summary-value" key={`${customerName}-${customerEmail}`}>
              {customerName || customerEmail ? `${customerName || "Guest"} ${customerEmail ? `(${customerEmail})` : ""}` : "Add details"}
            </dd>
          </div>
        </dl>
      </footer>
    </div>
  );
}
