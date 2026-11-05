"use client";
import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });
  if (state.status === "sent") {
    return (
      <div role="status" className="rounded-lg border border-rule bg-surface p-5">
        <p className="text-lg font-bold">Check your email</p>
        <p className="mt-2 text-ink-muted">
          We sent a sign-in link to <span className="font-semibold text-ink">{state.email}</span>. Open it in this browser
          within an hour. It works once.
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="block font-semibold">Work email</label>
        <input
          id="email" name="email" type="email" autoComplete="email" required inputMode="email"
          aria-describedby={state.status === "error" ? "email-error" : "email-help"}
          aria-invalid={state.status === "error"}
          className="mt-1.5 block h-12 w-full rounded-md border border-rule bg-surface px-3 text-base text-ink placeholder:text-ink-muted focus:border-brand"
          placeholder="jess@yourclinic.com.au"
        />
        {state.status === "error"
          ? <p id="email-error" className="mt-2 text-sm text-danger">{state.message}</p>
          : <p id="email-help" className="mt-2 text-sm text-ink-muted">No password. We email you a link that signs you in.</p>}
      </div>
      <button
        type="submit" disabled={pending}
        className="h-12 w-full cursor-pointer rounded-md bg-brand px-4 font-semibold text-on-brand transition-opacity duration-150 disabled:cursor-wait disabled:opacity-70"
      >
        {pending ? "Sending the link…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
