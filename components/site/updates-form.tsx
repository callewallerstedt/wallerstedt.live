"use client";

import { useActionState } from "react";

import { subscribeAction, type SubscribeState } from "@/app/updates/actions";

const initialState: SubscribeState = { status: "idle", message: "" };

export function UpdatesForm() {
  const [state, formAction, pending] = useActionState(subscribeAction, initialState);

  return (
    <form className="wl-signup" action={formAction}>
      <div className="wl-field">
        <input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@email.com"
          aria-label="Email address"
          required
        />
        <button className="wl-btn wl-btn--solid" type="submit" disabled={pending}>
          <span>{pending ? "Sending" : "Sign up"}</span>
        </button>
      </div>
      {state.message ? (
        <p
          className={`wl-note ${state.status === "error" ? "wl-note--bad" : "wl-note--ok"}`}
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : (
        <p className="wl-note">No spam. Unsubscribe whenever.</p>
      )}
    </form>
  );
}
