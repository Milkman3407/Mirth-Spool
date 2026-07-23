"use client";

import { useState } from "react";

type Rating = "SAFE" | "SENSITIVE" | "ADULT" | "UNKNOWN";
type FeedMode = "new" | "hot" | "random" | "unseen" | "for-you";

export function ContentPreferences({
  globalMaximumRating,
  initialFeedMode,
  initialMaximumRating,
  initialRecommendationsEnabled,
}: {
  readonly globalMaximumRating: Rating;
  readonly initialFeedMode: FeedMode;
  readonly initialMaximumRating: Rating;
  readonly initialRecommendationsEnabled: boolean;
}) {
  const [feedMode, setFeedMode] = useState(initialFeedMode);
  const [maximumRating, setMaximumRating] = useState(initialMaximumRating);
  const [message, setMessage] = useState<string | null>(null);
  const [recommendationsEnabled, setRecommendationsEnabled] = useState(
    initialRecommendationsEnabled,
  );

  async function save(next: {
    readonly defaultFeedMode?: FeedMode;
    readonly maximumContentRating?: Rating;
    readonly recommendationsEnabled?: boolean;
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
          <option value="for-you">For you</option>
        </select>
      </label>
      <label className="checkbox-label">
        <input
          checked={recommendationsEnabled}
          onChange={(event) => {
            const enabled = event.currentTarget.checked;
            setRecommendationsEnabled(enabled);
            if (!enabled && feedMode === "for-you") setFeedMode("new");
            void save({ recommendationsEnabled: enabled });
          }}
          type="checkbox"
        />
        Use my activity to personalize the For you feed
      </label>
      <button
        className="secondary-button"
        disabled={!recommendationsEnabled}
        onClick={() => {
          setMessage("Resetting recommendations…");
          void fetch("/api/settings/recommendations/reset", {
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }).then((response) =>
            setMessage(
              response.ok
                ? "Recommendations reset. Favorites and history were kept."
                : "Recommendations could not be reset.",
            ),
          );
        }}
        type="button"
      >
        Reset recommendation profile
      </button>
      <p>
        Personalization stays on this server. Resetting removes the derived
        profile; it does not remove favorites, hides, or history.
      </p>
      {message ? <p aria-live="polite">{message}</p> : null}
    </section>
  );
}
