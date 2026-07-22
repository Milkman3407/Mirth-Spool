"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  feedPageSchema,
  type FeedItem,
  type FeedPage,
} from "../lib/feed/client-schema";
import {
  mutateContentAction,
  type MutableActionKind,
} from "../lib/actions/client";
import { FeedCard } from "./feed-card";

export function FeedExperience({
  apiPath = "/api/feed",
  apiQuery,
  initialPage,
}: Readonly<{
  apiPath?: "/api/feed" | "/api/search";
  apiQuery: string;
  initialPage: FeedPage;
}>) {
  const [items, setItems] = useState<readonly FeedItem[]>(initialPage.items);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [actionNotice, setActionNotice] = useState<
    | {
        readonly item: FeedItem;
        readonly position: number;
        readonly type: "hidden";
      }
    | { readonly message: string; readonly type: "error" }
    | null
  >(null);
  const inFlight = useRef<AbortController | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const pathname = usePathname() ?? "/";
  const searchParameters = useSearchParams();
  const visibleQuery = searchParameters?.toString() ?? "";
  useFeedPosition(`${pathname}${visibleQuery ? `?${visibleQuery}` : ""}`);

  const loadMore = useCallback(async () => {
    if (!hasMore || !cursor || inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setStatus("loading");
    try {
      const query = new URLSearchParams(apiQuery);
      query.set("cursor", cursor);
      if (initialPage.seed) query.set("seed", initialPage.seed);
      const response = await fetch(`${apiPath}?${query.toString()}`, {
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
  }, [apiPath, apiQuery, cursor, hasMore, initialPage.seed]);

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

  const handleAction = useCallback(
    async (item: FeedItem, kind: MutableActionKind, next: boolean) => {
      if (kind !== "hide" || !next) {
        await mutateContentAction(item.id, kind, next);
        return;
      }
      const position = items.findIndex((candidate) => candidate.id === item.id);
      const hiddenItem = {
        ...item,
        actionState: { ...item.actionState, hidden: true },
      };
      setItems((current) =>
        current.filter((candidate) => candidate.id !== item.id),
      );
      setActionNotice({ item: hiddenItem, position, type: "hidden" });
      try {
        await mutateContentAction(item.id, "hide", true);
      } catch {
        setItems((current) => insertAt(current, item, position));
        setActionNotice({
          message: "The item was not hidden. It has been restored to the feed.",
          type: "error",
        });
      }
    },
    [items],
  );

  async function undoHide() {
    if (actionNotice?.type !== "hidden") return;
    const { item, position } = actionNotice;
    const restored = {
      ...item,
      actionState: { ...item.actionState, hidden: false },
    };
    setItems((current) => insertAt(current, restored, position));
    setActionNotice(null);
    try {
      await mutateContentAction(item.id, "hide", false);
    } catch {
      setItems((current) =>
        current.filter((candidate) => candidate.id !== item.id),
      );
      setActionNotice({
        message: "Undo was not saved. The item remains hidden.",
        type: "error",
      });
    }
  }

  return (
    <section aria-label="Content feed">
      {actionNotice ? (
        <div
          className={
            actionNotice.type === "error"
              ? "action-toast action-toast-error"
              : "action-toast"
          }
          role={actionNotice.type === "error" ? "alert" : "status"}
        >
          <span>
            {actionNotice.type === "hidden"
              ? "Item hidden from your feed."
              : actionNotice.message}
          </span>
          {actionNotice.type === "hidden" ? (
            <button onClick={() => void undoHide()} type="button">
              Undo hide
            </button>
          ) : null}
        </div>
      ) : null}
      {items.length === 0 ? (
        <div className="feed-empty" aria-live="polite">
          <span aria-hidden="true">◇</span>
          <h2>No items match this view</h2>
          <p>
            Try a broader filter, refresh an enabled source, or choose another
            feed mode.
          </p>
        </div>
      ) : (
        <div className="feed-list">
          {items.map((item) => (
            <FeedCard
              detailHref={`/content/${item.id}`}
              item={item}
              key={item.id}
              onActionRequest={handleAction}
              viewPolicy="visibility"
            />
          ))}
        </div>
      )}
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

function useFeedPosition(routeKey: string) {
  useEffect(() => {
    const key = `mirthspool:scroll:${routeKey}`;
    const saved = Number.parseInt(window.sessionStorage.getItem(key) ?? "", 10);
    const restoreTimer =
      Number.isFinite(saved) && saved >= 0
        ? window.setTimeout(() => window.scrollTo({ top: saved }), 250)
        : undefined;
    let saveFrame: number | undefined;
    const save = () =>
      window.sessionStorage.setItem(key, String(window.scrollY));
    const queueSave = () => {
      if (saveFrame !== undefined) return;
      saveFrame = window.requestAnimationFrame(() => {
        saveFrame = undefined;
        save();
      });
    };
    document.addEventListener("click", save, { capture: true });
    window.addEventListener("scroll", queueSave, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      if (restoreTimer !== undefined) window.clearTimeout(restoreTimer);
      if (saveFrame !== undefined) window.cancelAnimationFrame(saveFrame);
      document.removeEventListener("click", save, { capture: true });
      window.removeEventListener("scroll", queueSave);
      window.removeEventListener("pagehide", save);
    };
  }, [routeKey]);
}

function insertAt(
  items: readonly FeedItem[],
  item: FeedItem,
  position: number,
): readonly FeedItem[] {
  if (items.some((candidate) => candidate.id === item.id)) return items;
  const copy = [...items];
  copy.splice(Math.max(0, Math.min(position, copy.length)), 0, item);
  return copy;
}
