"use client";

import { useState } from "react";

export function ShareOriginal({
  title,
  url,
}: Readonly<{ title: string; url: string }>) {
  const [status, setStatus] = useState<string | null>(null);

  async function share() {
    setStatus(null);
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        setStatus("Original link shared.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setStatus("Sharing canceled.");
          return;
        }
      }
    }
    await copy();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Original link copied.");
    } catch {
      setStatus("Copy unavailable. Use Open original instead.");
    }
  }

  return (
    <div className="share-original">
      <button
        className="link-button"
        onClick={() => void share()}
        type="button"
      >
        Share original
      </button>
      <button className="link-button" onClick={() => void copy()} type="button">
        Copy link
      </button>
      {status ? (
        <span aria-live="polite" className="visually-hidden">
          {status}
        </span>
      ) : null}
    </div>
  );
}
