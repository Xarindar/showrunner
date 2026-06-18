"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { loginAction, type LoginState } from "./actions";
import { Button, Card } from "@/components/ui";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <Card action={action} className="login-card" as="form" bodyClassName="form-grid">
      <div>
        <p className="eyebrow">Admin</p>
        <h1 className="ui-title-lg ui-title-tight">Sign in</h1>
        <p className="lead lead-compact">
          Manage content, media, services, hours, and bookings.
        </p>
      </div>

      {state.error ? <div className="error">{state.error}</div> : null}

      <div className="field">
        <label htmlFor="username">Username</label>
        <input id="username" name="email" type="text" autoComplete="username" required />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>

      <Button aria-busy={pending} type="submit" disabled={pending}>
        <LogIn size={18} />
        Sign in
      </Button>
    </Card>);

}
