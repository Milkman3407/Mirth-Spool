"use client";

import { useState } from "react";

export function HistorySettings({
  initialEnabled,
}: Readonly<{ initialEnabled: boolean }>) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  async function change(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    setStatus("saving");
    try {
      const response = await fetch("/api/settings", {
        body: JSON.stringify({ historyEnabled: next }),
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      if (!response.ok) throw new Error("SETTINGS_UPDATE_FAILED");
      setStatus("saved");
    } catch {
      setEnabled(previous);
      setStatus("error");
    }
  }

  return (
    <section className="panel history-settings" aria-labelledby="history-title">
      <p className="eyebrow">Private browsing data</p>
      <h2 id="history-title">View history</h2>
      <label className="setting-toggle">
        <input
          checked={enabled}
          disabled={status === "saving"}
          onChange={(event) => void change(event.currentTarget.checked)}
          type="checkbox"
        />
        <span>Keep detailed view history</span>
      </label>
      <p>
        When enabled, MirthSpool records a first view, the latest coalesced
        view, and a bounded revisit count. Disabling this deletes your existing
        view rows, stops future view writes, and makes Unseen show the normal
        unhidden feed.
      </p>
      <p
        aria-live="polite"
        className={status === "error" ? "form-error" : "muted-text"}
      >
        {status === "saving"
          ? "Saving history preference…"
          : status === "saved"
            ? "History preference saved."
            : status === "error"
              ? "The history preference was not saved. Your previous choice was restored."
              : "This preference is stored only in your self-hosted instance."}
      </p>
    </section>
  );
}
