"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  mutateContentAction,
  type MutableActionKind,
} from "../lib/actions/client";
import type { FeedItem, FeedMedia } from "../lib/feed/client-schema";
import { ContentActions } from "./content-actions";

type Props = Readonly<{
  detailHref?: string;
  headingLevel?: 1 | 2;
  item: FeedItem;
  onActionRequest?: (
    item: FeedItem,
    kind: MutableActionKind,
    next: boolean,
  ) => Promise<void>;
  viewPolicy?: "navigation" | "none" | "visibility";
}>;

export function FeedCard({
  detailHref,
  headingLevel = 2,
  item,
  onActionRequest,
  viewPolicy = "none",
}: Props) {
  const guarded =
    item.contentRating !== "SAFE" || Boolean(item.contentWarning?.trim());
  const [revealed, setRevealed] = useState(!guarded);
  const originalUrl = safeHttpUrl(item.primarySource?.providerUrl);
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const article = useRef<HTMLElement | null>(null);

  useMeaningfulView(article, item.id, viewPolicy);

  return (
    <article className="feed-card" data-content-id={item.id} ref={article}>
      <header className="feed-card-header">
        <div>
          <p className="feed-source">
            {item.primarySource?.displayName ?? "Source unavailable"}
            {item.authorName ? ` · ${item.authorName}` : ""}
          </p>
          <time dateTime={item.publishedAt}>
            {formatTimestamp(item.publishedAt)}
          </time>
        </div>
        <span
          className={`rating-badge rating-${item.contentRating.toLowerCase()}`}
        >
          {item.contentRating.toLowerCase()}
        </span>
      </header>

      <Heading>{item.title ?? "Untitled post"}</Heading>
      {item.summary ? <p className="feed-summary">{item.summary}</p> : null}

      <div className={revealed ? "media-shell" : "media-shell media-guarded"}>
        <MediaFrame
          media={item.media}
          originalUrl={originalUrl}
          title={item.title ?? "Untitled post"}
        />
        {!revealed ? (
          <div
            className="content-warning"
            role="group"
            aria-label="Content warning"
          >
            <strong>{warningHeading(item.contentRating)}</strong>
            <span>
              {item.contentWarning ??
                "The source marked this content as restricted."}
            </span>
            <button
              aria-expanded="false"
              className="secondary-button"
              onClick={() => setRevealed(true)}
              type="button"
            >
              Reveal this item
            </button>
          </div>
        ) : guarded ? (
          <button
            aria-expanded="true"
            className="warning-toggle"
            onClick={() => setRevealed(false)}
            type="button"
          >
            Hide restricted media
          </button>
        ) : null}
      </div>

      {item.ranking ? (
        <p className="ranking-note" title={item.ranking.formula}>
          Hot score {item.ranking.score.toFixed(2)} · {item.ranking.decayHours}h
          decay
        </p>
      ) : null}

      <ContentActions
        contentId={item.id}
        initialState={item.actionState}
        {...(onActionRequest
          ? {
              onActionRequest: (kind: MutableActionKind, next: boolean) =>
                onActionRequest(item, kind, next),
            }
          : {})}
      />

      <footer className="feed-card-footer">
        <div>
          {detailHref ? (
            <Link className="text-link" href={detailHref}>
              View details
            </Link>
          ) : null}
          {item.alternateSourceCount > 0 ? (
            <span>
              {item.alternateSourceCount} alternate source
              {item.alternateSourceCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        {originalUrl ? (
          <a
            className="original-link"
            href={originalUrl}
            referrerPolicy="no-referrer"
            rel="external noopener noreferrer"
            target="_blank"
          >
            Open original <span aria-hidden="true">↗</span>
          </a>
        ) : (
          <span className="muted-text">Original link unavailable</span>
        )}
      </footer>
    </article>
  );
}

function useMeaningfulView(
  element: React.RefObject<HTMLElement | null>,
  contentId: string,
  policy: "navigation" | "none" | "visibility",
) {
  useEffect(() => {
    if (policy === "none") return;
    if (policy === "navigation") {
      void mutateContentAction(contentId, "view").catch(() => undefined);
      return;
    }
    const target = element.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let recorded = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (recorded) return;
        if (entry?.isIntersecting && entry.intersectionRatio >= 0.5) {
          timer ??= setTimeout(() => {
            recorded = true;
            observer.disconnect();
            void mutateContentAction(contentId, "view").catch(() => undefined);
          }, 1_500);
        } else if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [contentId, element, policy]);
}

export function MediaFrame({
  media,
  originalUrl,
  title,
}: Readonly<{
  media: FeedMedia | null;
  originalUrl: string | null;
  title: string;
}>) {
  const [failed, setFailed] = useState(false);
  const remoteUrl = media ? safeHttpUrl(media.remoteUrl) : null;
  const fallback = failed || !media || !remoteUrl || media.kind === "LINK";
  if (fallback)
    return (
      <div
        className="media-fallback"
        role="group"
        aria-label={`Media unavailable for ${title}`}
      >
        <span aria-hidden="true">↗</span>
        <strong>
          {failed ? "Media could not be loaded" : "Link-only post"}
        </strong>
        <p>Open the attributed original to view this content.</p>
        {originalUrl ? (
          <a
            href={originalUrl}
            referrerPolicy="no-referrer"
            rel="external noopener noreferrer"
            target="_blank"
          >
            Open original
          </a>
        ) : null}
      </div>
    );

  if (media.kind === "VIDEO")
    return (
      <video
        aria-label={media.altText ?? title}
        className="feed-media"
        controls
        muted
        onError={() => setFailed(true)}
        playsInline
        preload="metadata"
        src={remoteUrl}
      />
    );

  return (
    // Remote-only mode intentionally uses the normalized provider URL.
    <img
      alt={media.altText ?? title}
      className="feed-media"
      decoding="async"
      height={boundedDimension(media.height, 900)}
      loading="lazy"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={remoteUrl}
      width={boundedDimension(media.width, 1200)}
    />
  );
}

export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function boundedDimension(value: number | null, fallback: number) {
  return value && value > 0 && value <= 16_384 ? value : fallback;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function warningHeading(rating: FeedItem["contentRating"]) {
  if (rating === "ADULT") return "Adult content";
  if (rating === "SENSITIVE") return "Sensitive content";
  if (rating === "UNKNOWN") return "Unrated content";
  return "Content warning";
}
