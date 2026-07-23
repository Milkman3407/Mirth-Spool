"use client";

import { useState } from "react";

type Rating = "SAFE" | "SENSITIVE" | "ADULT" | "UNKNOWN";
type FeedMode = "new" | "hot" | "random" | "unseen";

export function ContentPreferences({
  globalMaximumRating,
  initialFeedMode,
  initialMaximumRating,
}: {
  readonly globalMaximumRating: Rating;
  readonly initialFeedMode: FeedMode;
  readonly initialMaximumRating: Rating;
}) {
  const [feedMode, setFeedMode] = useState(initialFeedMode);
  const [maximumRating, setMaximumRating] = useState(initialMaximumRating);
  const [message, setMessage] = useState<string | null>(null);

  async function save(next: {
    readonly defaultFeedMode?: FeedMode;
    readonly maximumContentRating?: Rating;
  }) {
    setMessage("Saving preferences…");
    const response = await fetch("/api/settings", {
      body: JSON.stringify(next),
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    setMessage(
      response.ok
        ? "Preferences saved."
        : "The preferences could not be saved.",
    );
  }

  return (
    <section className="panel" aria-labelledby="content-preferences-title">
      <p className="eyebrow">Personal feed policy</p>
      <h2 id="content-preferences-title">Content and feed defaults</h2>
      <label>
        Maximum content rating
        <select
          onChange={(event) => {
            const next = event.currentTarget.value as Rating;
            setMaximumRating(next);
            void save({ maximumContentRating: next });
          }}
          value={maximumRating}
        >
          <option value="SAFE">Safe</option>
          <option value="SENSITIVE">Sensitive</option>
          <option value="ADULT">Adult</option>
          <option value="UNKNOWN">Unknown</option>
        </select>
      </label>
      <p>
        Your choice can be stricter than the administrator policy, never
        broader. The current instance maximum is{" "}
        {globalMaximumRating.toLowerCase()}.
      </p>
      <label>
        Default feed
        <select
          onChange={(event) => {
            const next = event.currentTarget.value as FeedMode;
            setFeedMode(next);
            void save({ defaultFeedMode: next });
          }}
          value={feedMode}
        >
          <option value="new">Newest</option>
          <option value="hot">Hot</option>
          <option value="random">Random</option>
          <option value="unseen">Unseen</option>
        </select>
      </label>
      {message ? <p aria-live="polite">{message}</p> : null}
    </section>
  );
}
