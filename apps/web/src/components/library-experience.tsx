"use client";

import Link from "next/link";
import { useState } from "react";

import {
  mutateContentAction,
  type MutableActionKind,
} from "../lib/actions/client";
import type { FeedItem } from "../lib/feed/client-schema";
import { FeedCard } from "./feed-card";

export function LibraryExperience({
  emptyMessage,
  items: initialItems,
  kind,
  nextHref,
}: Readonly<{
  emptyMessage: string;
  items: readonly FeedItem[];
  kind: "favorites" | "hidden" | "history";
  nextHref: string | null;
}>) {
  const [items, setItems] = useState(initialItems);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleAction(
    item: FeedItem,
    action: MutableActionKind,
    next: boolean,
  ) {
    const removesFromView =
      (kind === "favorites" && action === "favorite" && !next) ||
      (kind === "hidden" && action === "hide" && !next);
    const position = items.findIndex((candidate) => candidate.id === item.id);
    if (removesFromView) {
      setItems((current) =>
        current.filter((candidate) => candidate.id !== item.id),
      );
      setNotice(null);
    }
    try {
      await mutateContentAction(item.id, action, next);
    } catch {
      if (removesFromView) {
        setItems((current) => insertAt(current, item, position));
      }
      setNotice(
        action === "favorite"
          ? "The favorite change was not saved. The library was restored."
          : "The hidden-state change was not saved. The library was restored.",
      );
    }
  }

  return (
    <section aria-label={`${kind} library`}>
      {notice ? (
        <p className="action-toast action-toast-error" role="alert">
          {notice}
        </p>
      ) : null}
      {items.length === 0 ? (
        <div className="feed-empty" aria-live="polite">
          <span aria-hidden="true">◇</span>
          <h2>Nothing here yet</h2>
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <div className="feed-list">
          {items.map((item) => (
            <FeedCard
              detailHref={`/content/${item.id}`}
              item={item}
              key={item.id}
              onActionRequest={handleAction}
              viewPolicy={kind === "favorites" ? "visibility" : "none"}
            />
          ))}
        </div>
      )}
      {nextHref ? (
        <nav aria-label="Library pagination" className="library-pagination">
          <Link className="secondary-button" href={nextHref}>
            Older items
          </Link>
        </nav>
      ) : items.length > 0 ? (
        <p className="feed-end">You reached the end of this library.</p>
      ) : null}
    </section>
  );
}

function insertAt(
  items: readonly FeedItem[],
  item: FeedItem,
  position: number,
) {
  if (items.some((candidate) => candidate.id === item.id)) return items;
  const copy = [...items];
  copy.splice(Math.max(0, Math.min(position, copy.length)), 0, item);
  return copy;
}
