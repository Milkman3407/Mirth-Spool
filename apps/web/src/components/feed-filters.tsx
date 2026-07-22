"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";

import type { FeedMode } from "../lib/feed/client-schema";

const modes: readonly Readonly<{ label: string; value: FeedMode }>[] = [
  { label: "Newest", value: "new" },
  { label: "Hot", value: "hot" },
  { label: "Random", value: "random" },
  { label: "Unseen", value: "unseen" },
];

export function FeedFilters({
  mode,
  sources,
}: Readonly<{
  mode: FeedMode;
  sources: readonly Readonly<{ id: string; name: string }>[];
}>) {
  const search = useSearchParams();
  const router = useRouter();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams(search.toString());
    next.delete("cursor");
    next.delete("seed");
    setValue(next, "sourceId", data.get("sourceId"));
    setValue(next, "mediaKind", data.get("mediaKind"));
    setValue(next, "rating", data.get("rating"));
    setValue(next, "tag", data.get("tag"));
    setDateValue(next, "from", data.get("from"), false);
    setDateValue(next, "to", data.get("to"), true);
    if (data.get("includeSeen") === "true") next.set("includeSeen", "true");
    else next.delete("includeSeen");
    router.push(queryHref(next));
  }

  return (
    <section className="feed-controls" aria-labelledby="feed-controls-title">
      <div className="mode-tabs" aria-label="Feed order">
        {modes.map((entry) => (
          <Link
            aria-current={mode === entry.value ? "page" : undefined}
            className={mode === entry.value ? "mode-tab active" : "mode-tab"}
            href={modeHref(search, entry.value)}
            key={entry.value}
          >
            {entry.label}
          </Link>
        ))}
      </div>

      <details className="filter-panel">
        <summary id="feed-controls-title">Filter this feed</summary>
        <form className="feed-filter-form" onSubmit={submit}>
          <label>
            Source
            <select defaultValue={search.get("sourceId") ?? ""} name="sourceId">
              <option value="">All sources</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Media type
            <select
              defaultValue={search.get("mediaKind") ?? ""}
              name="mediaKind"
            >
              <option value="">All media</option>
              <option value="IMAGE">Images</option>
              <option value="ANIMATED_IMAGE">Animated images</option>
              <option value="VIDEO">Video</option>
              <option value="LINK">Links</option>
            </select>
          </label>
          <label>
            Maximum rating
            <select defaultValue={search.get("rating") ?? ""} name="rating">
              <option value="">Account setting</option>
              <option value="safe">Safe</option>
              <option value="sensitive">Sensitive</option>
              <option value="adult">Adult</option>
            </select>
          </label>
          <label>
            Tag
            <input
              defaultValue={search.get("tag") ?? ""}
              maxLength={80}
              name="tag"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="reaction-image"
            />
          </label>
          <label>
            Published after (UTC)
            <input
              defaultValue={dateInput(search.get("from"))}
              name="from"
              type="datetime-local"
            />
          </label>
          <label>
            Published before (UTC)
            <input
              defaultValue={dateInput(search.get("to"))}
              name="to"
              type="datetime-local"
            />
          </label>
          <label className="checkbox-label">
            <input
              defaultChecked={search.get("includeSeen") === "true"}
              name="includeSeen"
              type="checkbox"
              value="true"
            />
            Include viewed items in unseen mode
          </label>
          <div className="filter-actions">
            <button type="submit">Apply filters</button>
            <Link className="secondary-link" href={`/?mode=${mode}`}>
              Reset filters
            </Link>
          </div>
        </form>
      </details>
    </section>
  );
}

function modeHref(search: URLSearchParams, mode: FeedMode) {
  const next = new URLSearchParams(search.toString());
  next.set("mode", mode);
  next.delete("cursor");
  next.delete("seed");
  return queryHref(next);
}

function queryHref(parameters: URLSearchParams) {
  const query = parameters.toString();
  return query ? `/?${query}` : "/";
}

function setValue(
  parameters: URLSearchParams,
  key: string,
  value: FormDataEntryValue | null,
) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text) parameters.set(key, text);
  else parameters.delete(key);
}

function setDateValue(
  parameters: URLSearchParams,
  key: string,
  value: FormDataEntryValue | null,
  endOfMinute: boolean,
) {
  const text = typeof value === "string" ? value : "";
  if (!text) {
    parameters.delete(key);
    return;
  }
  const date = new Date(`${text}:00.000Z`);
  if (endOfMinute) date.setUTCSeconds(59, 999);
  parameters.set(key, date.toISOString());
}

function dateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString().slice(0, 16);
}
