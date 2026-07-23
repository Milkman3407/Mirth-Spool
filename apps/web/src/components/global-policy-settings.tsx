"use client";

import { useState } from "react";

type Rating = "SAFE" | "SENSITIVE" | "ADULT" | "UNKNOWN";

export function GlobalPolicySettings({
  initialMaximumRating,
}: {
  readonly initialMaximumRating: Rating;
}) {
  const [value, setValue] = useState(initialMaximumRating);
  const [message, setMessage] = useState<string | null>(null);
  async function change(next: Rating) {
    const previous = value;
    setValue(next);
    const response = await fetch("/api/admin/settings", {
      body: JSON.stringify({ maximumContentRating: next }),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    if (!response.ok) setValue(previous);
    setMessage(
      response.ok
        ? "Global content ceiling saved."
        : "The global policy could not be saved.",
    );
  }
  return (
    <section className="panel" aria-labelledby="global-policy-title">
      <p className="eyebrow">Administration</p>
      <h2 id="global-policy-title">Global content ceiling</h2>
      <label>
        Maximum allowed rating
        <select
          onChange={(event) => void change(event.currentTarget.value as Rating)}
          value={value}
        >
          <option value="SAFE">Safe</option>
          <option value="SENSITIVE">Sensitive</option>
          <option value="ADULT">Adult</option>
          <option value="UNKNOWN">Unknown</option>
        </select>
      </label>
      <p>Member preferences are always clamped to this server-side policy.</p>
      {message ? <p aria-live="polite">{message}</p> : null}
    </section>
  );
}
