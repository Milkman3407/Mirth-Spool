"use client";

import { type FormEvent, useState } from "react";

interface SessionItem {
  readonly createdAt: string;
  readonly current: boolean;
  readonly expiresAt: string;
  readonly id: string;
  readonly userAgent: string | null;
}

export function SecurityControls({
  initialSessions,
}: {
  initialSessions: readonly SessionItem[];
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [message, setMessage] = useState<string | null>(null);

  async function revoke(id: string) {
    const response = await fetch(
      `/api/account/sessions/${encodeURIComponent(id)}`,
      {
        headers: { "content-type": "application/json" },
        method: "DELETE",
      },
    );
    if (response.ok)
      setSessions((items) => items.filter((item) => item.id !== id));
    else setMessage("The session could not be revoked.");
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const form = event.currentTarget;
    const values = new FormData(form);
    const response = await fetch("/api/account/password", {
      body: JSON.stringify(Object.fromEntries(values.entries())),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    setMessage(
      response.ok
        ? "Password changed; other sessions were revoked."
        : "The password could not be changed.",
    );
    if (response.ok) form.reset();
  }

  return (
    <>
      <section className="panel">
        <h2>Active sessions</h2>
        <ul className="session-list">
          {sessions.map((session) => (
            <li key={session.id}>
              <div>
                <strong>
                  {session.current ? "This session" : "Signed-in session"}
                </strong>
                <small>{session.userAgent ?? "Unknown browser"}</small>
                <small>
                  Expires {new Date(session.expiresAt).toLocaleString()}
                </small>
              </div>
              {session.current ? null : (
                <button onClick={() => revoke(session.id)} type="button">
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2>Change password</h2>
        <form className="auth-form compact" onSubmit={changePassword}>
          <label>
            Current password
            <input
              autoComplete="current-password"
              name="currentPassword"
              required
              type="password"
            />
          </label>
          <label>
            New password
            <input
              autoComplete="new-password"
              minLength={12}
              name="newPassword"
              required
              type="password"
            />
          </label>
          <button type="submit">Change password</button>
        </form>
        {message ? <p aria-live="polite">{message}</p> : null}
      </section>
    </>
  );
}
