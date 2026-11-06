"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notification } from "@/components/ui/notifications";
import { updateSessionTypeAction } from "../actions";
import { SessionDraftGuard, revealInvalidSessionField } from "./session-draft-guard";

export function SessionDetailsForm({ children }: { children: ReactNode }) {
  const [state, action, pending] = useActionState(updateSessionTypeAction, { error: "" });
  return <form action={action} className="product-studio-save-grid" id="service-core-form" onReset={event => event.preventDefault()} onInvalidCapture={revealInvalidSessionField} aria-busy={pending}>
    {state.error && <Notification tone="danger" eventKey={state}>{state.error}</Notification>}
    {pending && <p role="status" style={{ gridColumn: "1 / -1" }}>Saving session…</p>}
    {children}
  </form>;
}

export function SessionDetailsSaveButton() {
  const { pending } = useFormStatus();
  return <>
    <SessionDraftGuard formId="service-core-form" />
    <Button type="submit" disabled={pending}><Save size={16} />{pending ? "Saving…" : "Save session"}</Button>
  </>;
}
