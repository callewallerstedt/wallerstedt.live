"use client";

import { useActionState } from "react";

import { subscribeAction, type SubscribeState } from "@/app/updates/actions";

const initialState: SubscribeState = { status: "idle", message: "" };

export function UpdatesForm({ source = "" }: { source?: string }) {
  const [state, formAction, pending] = useActionState(subscribeAction, initialState);
  const done = state.status === "success";

  return (
    <form className={`wl-signup${done ? " is-done" : ""}`} action={formAction}>
      <div className="wl-field">
        <input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="your@email.com"
          aria-label="Email address"
          required
          disabled={done}
        />
        <input type="hidden" name="source" value={source} />
        <input className="wl-hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
        <button className="wl-btn wl-btn--light" type="submit" disabled={pending || done}>
          <span>{done ? "Done" : pending ? "…" : "Sign up"}</span>
        </button>
      </div>
      <p className={`wl-note${state.status === "error" ? " is-bad" : done ? " is-ok" : ""}`} aria-live="polite">
        {state.message}
      </p>
    </form>
  );
}
