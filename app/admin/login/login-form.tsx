"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="card login-card form-grid">
      <div>
        <p className="eyebrow">Admin</p>
        <h1 style={{ fontSize: "2.4rem", marginBottom: 8 }}>Sign in</h1>
        <p className="lead" style={{ fontSize: "1rem" }}>
          Manage content, media, services, hours, and bookings.
        </p>
      </div>

      {state.error ? <div className="error">{state.error}</div> : null}

      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>

      <button aria-busy={pending} className="button" type="submit" disabled={pending}>
        <LogIn size={18} />
        Sign in
      </button>
    </form>
  );
}
