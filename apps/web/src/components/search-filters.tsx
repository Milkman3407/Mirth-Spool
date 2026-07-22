"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";

export function SearchFilters({
  allowHidden,
  sources,
  tags,
}: Readonly<{
  allowHidden: boolean;
  sources: readonly Readonly<{ id: string; name: string }>[];
  tags: readonly Readonly<{ label: string; slug: string }>[];
}>) {
  const current = useSearchParams();
  const router = useRouter();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of [
      "q",
      "sourceId",
      "mediaKind",
      "rating",
      "tag",
      "favorite",
      "hidden",
      "seen",
    ]) {
      const value = String(form.get(key) ?? "").trim();
      if (value) next.set(key, value);
    }
    setDate(next, "from", form.get("from"), false);
    setDate(next, "to", form.get("to"), true);
    router.push(next.size > 0 ? `/search?${next.toString()}` : "/search");
  }

  return (
    <section className="search-controls" aria-labelledby="search-form-title">
      <form className="search-filter-form" onSubmit={submit}>
        <h2 id="search-form-title">Search and filter</h2>
        <label className="search-query-field">
          Search titles, authors, communities, sources, and tags
          <input
            defaultValue={current.get("q") ?? ""}
            maxLength={200}
            name="q"
            placeholder="reaction cat"
            type="search"
          />
        </label>
        <label>
          Source
          <select defaultValue={current.get("sourceId") ?? ""} name="sourceId">
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
            defaultValue={current.get("mediaKind") ?? ""}
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
          Rating
          <select defaultValue={current.get("rating") ?? ""} name="rating">
            <option value="">Account setting</option>
            <option value="SAFE">Safe</option>
            <option value="SENSITIVE">Sensitive</option>
            <option value="ADULT">Adult</option>
            <option value="UNKNOWN">Unknown</option>
          </select>
        </label>
        <label>
          Tag
          <input
            defaultValue={current.get("tag") ?? ""}
            list="search-tag-options"
            maxLength={80}
            name="tag"
          />
          <datalist id="search-tag-options">
            {tags.map((tag) => (
              <option key={tag.slug} value={tag.slug}>
                {tag.label}
              </option>
            ))}
          </datalist>
        </label>
        <label>
          Favorite state
          <select defaultValue={current.get("favorite") ?? ""} name="favorite">
            <option value="">Any</option>
            <option value="true">Favorites only</option>
            <option value="false">Not favorited</option>
          </select>
        </label>
        <label>
          Seen state
          <select defaultValue={current.get("seen") ?? ""} name="seen">
            <option value="">Any</option>
            <option value="false">Unseen</option>
            <option value="true">Seen</option>
          </select>
        </label>
        {allowHidden ? (
          <label>
            Hidden administrative view
            <select defaultValue={current.get("hidden") ?? ""} name="hidden">
              <option value="">Exclude hidden</option>
              <option value="true">Hidden only</option>
            </select>
          </label>
        ) : null}
        <label>
          Published after (UTC)
          <input
            defaultValue={dateInput(current.get("from"))}
            name="from"
            type="datetime-local"
          />
        </label>
        <label>
          Published before (UTC)
          <input
            defaultValue={dateInput(current.get("to"))}
            name="to"
            type="datetime-local"
          />
        </label>
        <div className="filter-actions">
          <button type="submit">Search</button>
          <Link className="secondary-link" href="/search">
            Clear search
          </Link>
        </div>
      </form>
    </section>
  );
}

function setDate(
  parameters: URLSearchParams,
  key: string,
  value: FormDataEntryValue | null,
  endOfMinute: boolean,
) {
  const text = typeof value === "string" ? value : "";
  if (!text) return;
  const date = new Date(`${text}:00.000Z`);
  if (endOfMinute) date.setUTCSeconds(59, 999);
  parameters.set(key, date.toISOString());
}

function dateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString().slice(0, 16);
}
