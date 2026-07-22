"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  feedPageSchema,
  type FeedItem,
  type FeedPage,
} from "../lib/feed/client-schema";
import { FeedCard } from "./feed-card";

export function FeedExperience({
  apiQuery,
  initialPage,
}: Readonly<{
  apiQuery: string;
  initialPage: FeedPage;
}>) {
  const [items, setItems] = useState<readonly FeedItem[]>(initialPage.items);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const inFlight = useRef<AbortController | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (!hasMore || !cursor || inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setStatus("loading");
    try {
      const query = new URLSearchParams(apiQuery);
      query.set("cursor", cursor);
      if (initialPage.seed) query.set("seed", initialPage.seed);
      const response = await fetch(`/api/feed?${query.toString()}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("FEED_PAGE_FAILED");
      const page = feedPageSchema.parse(await response.json());
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...page.items.filter((item) => !known.has(item.id)),
        ];
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setStatus("idle");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        setStatus("error");
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, [apiQuery, cursor, hasMore, initialPage.seed]);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasMore || typeof IntersectionObserver === "undefined")
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  useEffect(
    () => () => {
      inFlight.current?.abort();
    },
    [],
  );

  if (items.length === 0)
    return (
      <section className="feed-empty" aria-live="polite">
        <span aria-hidden="true">◇</span>
        <h2>No items match this view</h2>
        <p>
          Try a broader filter, refresh an enabled source, or choose another
          feed mode.
        </p>
      </section>
    );

  return (
    <section aria-label="Content feed">
      <div className="feed-list">
        {items.map((item) => (
          <FeedCard
            detailHref={`/content/${item.id}`}
            item={item}
            key={item.id}
          />
        ))}
      </div>
      <div className="feed-pagination" ref={sentinel}>
        {status === "loading" ? (
          <div aria-live="polite" className="feed-loading" role="status">
            <span className="skeleton-line" />
            <span>Loading more posts…</span>
          </div>
        ) : null}
        {status === "error" ? (
          <div className="feed-error" role="alert">
            <strong>That page did not load.</strong>
            <span>
              Your current posts are still here. Check source health if this
              persists.
            </span>
            <button onClick={() => void loadMore()} type="button">
              Retry loading
            </button>
          </div>
        ) : null}
        {hasMore && status === "idle" ? (
          <button
            className="secondary-button load-more"
            onClick={() => void loadMore()}
            type="button"
          >
            Load more
          </button>
        ) : null}
        {!hasMore ? (
          <p className="feed-end" role="status">
            You reached the end of this feed.
          </p>
        ) : null}
      </div>
    </section>
  );
}
