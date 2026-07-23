"use client";

import { type FormEvent, useState } from "react";

export function InvitationAcceptanceForm({
  token,
}: {
  readonly token: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch("/api/invitations/accept", {
      body: JSON.stringify({
        email: data.get("email"),
        name: data.get("name"),
        password: data.get("password"),
        token,
      }),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (response.ok) {
      window.location.assign("/login?invitation=accepted");
      return;
    }
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    setMessage(body?.error?.message ?? "The invitation could not be accepted.");
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      <label>
        Invited email
        <input autoComplete="email" name="email" required type="email" />
      </label>
      <label>
        Display name
        <input autoComplete="name" maxLength={120} name="name" required />
      </label>
      <label>
        Password
        <input
          autoComplete="new-password"
          maxLength={128}
          minLength={12}
          name="password"
          required
          type="password"
        />
      </label>
      <button type="submit">Create member account</button>
      {message ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}
