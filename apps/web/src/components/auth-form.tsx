"use client";

import { type FormEvent, useState } from "react";
import { clearOriginCaches } from "./pwa-lifecycle";

type Mode = "login" | "setup";

interface ApiFailure {
  error?: { message?: string };
}

export function AuthForm({ mode }: { mode: Mode }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    const response = await fetch(
      mode === "setup" ? "/api/setup" : "/api/auth/sign-in/email",
      {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
    if (response.ok) {
      await clearOriginCaches().catch(() => undefined);
      window.location.assign("/");
      return;
    }
    const failure = (await response.json().catch(() => ({}))) as ApiFailure;
    setError(failure.error?.message ?? "The request could not be completed.");
    setPending(false);
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {mode === "setup" ? (
        <label>
          Display name
          <input autoComplete="name" maxLength={80} name="name" required />
        </label>
      ) : null}
      <label>
        Email address
        <input
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </label>
      <label>
        Password
        <input
          autoComplete={mode === "setup" ? "new-password" : "current-password"}
          maxLength={256}
          minLength={12}
          name="password"
          required
          type="password"
        />
      </label>
      {mode === "setup" ? (
        <p className="form-hint">
          Use at least 12 characters. Common and compromised-style passwords are
          rejected.
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button disabled={pending} type="submit">
        {pending
          ? "Please wait…"
          : mode === "setup"
            ? "Create administrator"
            : "Sign in"}
      </button>
    </form>
  );
}
