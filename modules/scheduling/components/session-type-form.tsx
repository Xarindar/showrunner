"use client";

import { useActionState, type ComponentProps, type ReactNode } from "react";
import type { Service } from "@prisma/client";
import { ArrowLeft, Save } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Notification } from "@/components/ui/notifications";
import { AdminMobileHeaderSlot } from "@/shell/admin-mobile-header";
import { nonEmptyStringArrayFromUnknown } from "@/lib/format";
import type { HourlyRate } from "@/lib/scheduling/pricing";
import type { BookingRule } from "@/lib/scheduling/booking-rules";
import type { SessionOffering } from "@/lib/scheduling/session-offering";
import { createServiceAction, updateSessionTypeAction } from "../actions";
import { ServiceTagsField } from "./service-tags-field";
import { SessionPackagesEditor } from "./session-packages-editor";
import { SessionDraftGuard, revealInvalidSessionField } from "./session-draft-guard";
import { ServiceMediaFields } from "./service-media-fields";
import { ServicePresetField } from "./service-preset-field";
import { ServiceBookingRulesTable } from "./service-booking-rules-table";
import styles from "../service-editor.module.css";

type InitialSession = Pick<Service, "id" | "updatedAt" | "name" | "description" | "category" | "tags" | "isActive" | "location" | "durationMinutes" | "priceCents" | "pricingType" | "hourlyRateId" | "bufferBeforeMinutes" | "bufferAfterMinutes" | "minimumNoticeHours" | "maxAdvanceDays" | "slotIntervalMinutes" | "bookingRules" | "intakePrompt" | "policyText" | "requirePolicy" | "requestOnly" | "waitlistEnabled">;

export function SessionTypeForm({ businessHours, timezone, canUpload, schedulingRules, rates, tags, categoryOptions = [], availableRules, intakeOptions, policyOptions, initialService, initialOffering, initialMedia }: {
  businessHours: string[]; timezone: string; canUpload: boolean; schedulingRules: ReactNode; rates: HourlyRate[]; tags: string[]; categoryOptions?: string[];
  availableRules?: BookingRule[]; intakeOptions?: string[]; policyOptions?: string[];
  initialService?: InitialSession; initialOffering?: SessionOffering | null; initialMedia?: Omit<ComponentProps<typeof ServiceMediaFields>, "canUpload">;
}) {
  const [state, action, pending] = useActionState(initialService ? updateSessionTypeAction : createServiceAction, { error: "" });
  const formId = initialService ? "service-core-form" : "new-session-type-form";
  const detailsId = initialService ? "session-details-title" : "new-session-details-title";
  const title = initialService?.name ?? "New session";
  return <div className={`${styles.page} stack product-studio-page product-editor-page service-editor-page has-mobile-shell-header`}>
    <AdminMobileHeaderSlot backHref="/admin/modules/services" title={title} />
    <header className="page-header service-studio-header"><div className={styles.heading}>
      <ButtonLink href="/admin/modules/services" size="sm" variant="ghost"><ArrowLeft size={15} />Services</ButtonLink>
      <h1>{title}</h1>
      {initialService && <span className={initialService.isActive ? "ui-badge ui-badge-success" : "ui-badge"}>{initialService.isActive ? "active" : "draft"}</span>}
    </div></header>
    <form id={formId} action={action} className="product-studio-save-grid" onReset={event => event.preventDefault()} onInvalidCapture={revealInvalidSessionField} aria-busy={pending}>
      {initialService && <>
        <input name="id" type="hidden" value={initialService.id} />
        <input name="updatedAt" type="hidden" value={initialService.updatedAt.toISOString()} />
        <input name="location" type="hidden" value={initialService.location || ""} />
      </>}
      <main className={`product-studio-main ${styles.detailsMain}`}>
        <section className="studio-panel ui-section-card" aria-labelledby={detailsId}>
          <div className="ui-section-header"><h2 id={detailsId}>Session details</h2></div>
          <div className="ui-section-body">
            <Field label="Session name"><Input name="name" defaultValue={initialService?.name ?? ""} required placeholder="Family session" /></Field>
            <Field label="Description"><Textarea id="service-description" name="description" defaultValue={initialService?.description ?? ""} rows={3} /></Field>
            <ServicePresetField defaultValue={initialService?.category ?? ""} emptyLabel="Uncategorized" id="service-category" label="Category" name="category" newLabel="New category" newPlaceholder="Category name" options={categoryOptions} />
            <ServiceMediaFields canUpload={canUpload} {...initialMedia} />
            <Switch label="Active" name="isActive" variant="inline" defaultChecked={initialService?.isActive ?? false} />
            <ServiceTagsField tags={tags} initialTags={nonEmptyStringArrayFromUnknown(initialService?.tags)} />
          </div>
        </section>
        <SessionPackagesEditor initialRates={rates} isNew={!initialService} initialOffering={initialOffering} durationMinutes={initialService?.durationMinutes} priceCents={initialService?.priceCents} initialPricingType={initialService?.pricingType} initialHourlyRateId={initialService?.hourlyRateId ?? ""} initialScheduling={initialService}
          bookingAvailability={<><p className="muted-text ui-zero">{businessHours.length ? `Uses shared business hours (${timezone}).` : `Set business hours (${timezone}) before activating this session.`} Booking settings apply to every package in this session.</p>{schedulingRules}</>} />
        <ServiceBookingRulesTable idPrefix={initialService ? "service" : "new-session"} availableRules={availableRules} intakeOptions={intakeOptions} policyOptions={policyOptions}
          defaultRules={initialService?.bookingRules} defaultIntakePrompt={initialService?.intakePrompt} defaultPolicyText={initialService?.policyText} defaultRequirePolicy={initialService?.requirePolicy} defaultRequestOnly={initialService?.requestOnly} defaultWaitlistEnabled={initialService?.waitlistEnabled} />
      </main>
      {state.error && <Notification tone="danger" eventKey={state}>{state.error}</Notification>}
      <footer className={styles.saveFooter}>
        <SessionDraftGuard formId={formId} />
        <Button disabled={pending} type="submit"><Save size={16} />{pending ? "Saving…" : "Save session"}</Button>
      </footer>
    </form>
  </div>;
}
