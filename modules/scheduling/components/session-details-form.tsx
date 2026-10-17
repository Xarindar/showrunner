"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Save } from "lucide-react";
import { Button } from "@/components/ui";
import { updateSessionTypeAction } from "../actions";
import { SessionDraftGuard, revealInvalidSessionField } from "./session-draft-guard";

export function SessionDetailsForm({ children }: { children: ReactNode }) {
  const [state, action, pending] = useActionState(updateSessionTypeAction, { error: "" });
  return <form action={action} className="product-studio-save-grid" id="service-core-form" onReset={event => event.preventDefault()} onInvalidCapture={revealInvalidSessionField} aria-busy={pending}>
    <SessionDraftGuard formId="service-core-form" />
    {state.error && <p role="alert" className="error" style={{ gridColumn: "1 / -1" }}>{state.error}</p>}
    {pending && <p role="status" style={{ gridColumn: "1 / -1" }}>Saving session type…</p>}
    {children}
  </form>;
}

export function SessionDetailsSaveButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}><Save size={16} />{pending ? "Saving…" : "Save session type"}</Button>;
}
