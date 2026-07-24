"use client";

import { useState } from "react";

type Rating = "SAFE" | "SENSITIVE" | "ADULT" | "UNKNOWN";
type Weights = Readonly<{
  favorite: number;
  freshness: number;
  hide: number;
  media: number;
  source: number;
  sourcePriority: number;
  tag: number;
  view: number;
}>;

export function GlobalPolicySettings({
  initialMaximumRating,
  initialRecommendationWeights,
}: {
  readonly initialMaximumRating: Rating;
  readonly initialRecommendationWeights: Weights;
}) {
  const [value, setValue] = useState(initialMaximumRating);
  const [message, setMessage] = useState<string | null>(null);
  const [weights, setWeights] = useState(initialRecommendationWeights);
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
      <h3>Recommendation weights</h3>
      <p>
        Values are validated and bounded on the server. Changes apply to new For
        you snapshots.
      </p>
      {(
        [
          ["favorite", "Favorite signal", 0, 5],
          ["hide", "Hide signal", -5, 0],
          ["view", "Meaningful view signal", 0, 1],
          ["source", "Source affinity", 0, 3],
          ["tag", "Topic affinity", 0, 3],
          ["media", "Media affinity", 0, 2],
          ["freshness", "Freshness", 0, 2],
          ["sourcePriority", "Configured source priority", 0, 1],
        ] as const
      ).map(([key, label, minimum, maximum]) => (
        <label key={key}>
          {label}
          <input
            max={maximum}
            min={minimum}
            onChange={(event) =>
              setWeights({
                ...weights,
                [key]: Number(event.currentTarget.value),
              })
            }
            step="0.05"
            type="number"
            value={weights[key]}
          />
        </label>
      ))}
      <button
        className="secondary-button"
        onClick={() => {
          void fetch("/api/admin/settings", {
            body: JSON.stringify({ recommendationWeights: weights }),
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          }).then((response) =>
            setMessage(
              response.ok
                ? "Recommendation weights saved."
                : "Recommendation weights were rejected.",
            ),
          );
        }}
        type="button"
      >
        Save recommendation weights
      </button>
      {message ? <p aria-live="polite">{message}</p> : null}
    </section>
  );
}
