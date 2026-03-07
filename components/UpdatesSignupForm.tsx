"use client";

import { useActionState } from "react";

import { subscribeAction, type SubscribeState } from "@/app/updates/actions";

const initialState: SubscribeState = {
  status: "idle",
  message: "",
};

export function UpdatesSignupForm() {
  const [state, formAction, isPending] = useActionState(subscribeAction, initialState);

  return (
    <>
      <form className="updates-form" action={formAction}>
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
        </label>
        <button className="button button--primary" type="submit" disabled={isPending}>
          {isPending ? "Signing up..." : "Sign up"}
        </button>
      </form>
      {state.message ? (
        <div
          className={
            state.status === "error"
              ? "signup-feedback signup-feedback--error"
              : "signup-feedback signup-feedback--success"
          }
          aria-live="polite"
        >
          <div className="signup-feedback__pulse" aria-hidden="true"></div>
          <p className={state.status === "error" ? "status-copy status-copy--error" : "status-copy"}>{state.message}</p>
        </div>
      ) : null}
    </>
  );
}
