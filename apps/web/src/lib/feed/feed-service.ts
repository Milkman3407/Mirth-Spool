import {
  explainHotRanking,
  getFeedContent,
  queryFeed,
  randomSeedPivot,
  readSetting,
  type ContentRating,
  type FeedQuery,
} from "../../../../../packages/db/dist/index";
import { randomBytes } from "node:crypto";

import { decodeFeedCursor, encodeFeedCursor } from "./cursor";
import { parseFeedQuery } from "./schemas";

type Services = Readonly<{
  database: Parameters<typeof queryFeed>[0];
  secret: string;
}>;
type FeedRow = Awaited<ReturnType<typeof queryFeed>>["rows"][number];
type ContentRow = NonNullable<Awaited<ReturnType<typeof getFeedContent>>>;
const allRatings = ["SAFE", "SENSITIVE", "ADULT", "UNKNOWN"] as const;

export async function readFeed(
  services: Services,
  userId: string,
  url: string,
  now = new Date(),
) {
  const query = parseFeedQuery(url);
  const [ceiling, historyEnabled] = await Promise.all([
    readSetting(services.database, "content.maximumRating"),
    readSetting(services.database, "history.enabled"),
  ]);
  const allowedRatings = ratingsFor(ceiling, query.rating);
  const cursor = query.cursor
    ? decodeFeedCursor(query.cursor, services.secret)
    : undefined;
  const seed =
    query.mode === "random"
      ? (query.seed ?? cursor?.seed ?? randomBytes(18).toString("base64url"))
      : undefined;
  if (
    cursor &&
    (cursor.m !== query.mode ||
      cursor.f !== query.fingerprint ||
      (query.seed && cursor.seed !== query.seed))
  )
    throw new Error("INVALID_CURSOR");
  const position = cursor
    ? {
        id: cursor.i,
        ...(cursor.p ? { publishedAt: new Date(cursor.p) } : {}),
        ...(cursor.r !== undefined ? { randomKey: cursor.r } : {}),
        ...(cursor.s !== undefined ? { rankingScore: cursor.s } : {}),
      }
    : undefined;
  const base: FeedQuery = {
    allowedRatings: [...allowedRatings],
    ...(query.from ? { from: query.from } : {}),
    includeSeen: query.includeSeen || !historyEnabled,
    limit: query.limit,
    mediaKinds: query.kinds,
    mode: query.mode,
    ...(position ? { position } : {}),
    ...(seed ? { randomPivot: randomSeedPivot(seed) } : {}),
    ...(cursor?.w !== undefined ? { randomWrapped: cursor.w } : {}),
    sourceIds: query.sourceIds,
    tags: query.tags,
    ...(query.to ? { to: query.to } : {}),
    userId,
  };
  let page = await queryFeed(services.database, base);
  let wrapped = cursor?.w ?? false;
  if (query.mode === "random" && page.rows.length < query.limit && !wrapped) {
    const remaining = query.limit - page.rows.length;
    const { position, ...withoutPosition } = base;
    void position;
    const second = await queryFeed(services.database, {
      ...withoutPosition,
      limit: remaining,
      randomPivot: randomSeedPivot(seed!),
      randomWrapped: true,
    });
    page = { rows: [...page.rows, ...second.rows], hasMore: second.hasMore };
    wrapped = true;
  }
  if (
    query.mode === "random" &&
    !wrapped &&
    !page.hasMore &&
    page.rows.length === query.limit
  ) {
    const { position, ...withoutPosition } = base;
    void position;
    const wrappedProbe = await queryFeed(services.database, {
      ...withoutPosition,
      limit: 1,
      randomPivot: randomSeedPivot(seed!),
      randomWrapped: true,
    });
    page = { ...page, hasMore: wrappedProbe.rows.length > 0 };
  }
  const last = page.rows.at(-1);
  const nextCursor =
    page.hasMore && last
      ? encodeFeedCursor(
          {
            f: query.fingerprint,
            i: last.id,
            m: query.mode,
            ...(query.mode !== "random"
              ? { p: last.publishedAt.toISOString() }
              : {}),
            ...(query.mode === "hot" ? { s: last.rankingScore } : {}),
            ...(query.mode === "random"
              ? { r: last.randomKey, seed, w: wrapped }
              : {}),
            v: 1,
          },
          services.secret,
        )
      : null;
  return Object.freeze({
    hasMore: page.hasMore,
    items: page.rows.map((row) =>
      presentFeedItem(row, now, query.mode === "hot", historyEnabled),
    ),
    nextCursor,
    ...(seed ? { seed } : {}),
  });
}

export async function readContent(
  services: Services,
  userId: string,
  contentId: string,
) {
  const [ceiling, historyEnabled] = await Promise.all([
    readSetting(services.database, "content.maximumRating"),
    readSetting(services.database, "history.enabled"),
  ]);
  const row = await getFeedContent(services.database, {
    allowedRatings: [...ratingsFor(ceiling)],
    contentId,
    userId,
  });
  return row ? presentDetail(row, historyEnabled) : null;
}

export function ratingsFor(
  ceiling: string,
  requested?: string,
): readonly ContentRating[] {
  const maximum = { SAFE: 0, SENSITIVE: 1, ADULT: 2, UNKNOWN: 3 }[ceiling] ?? 0;
  const requestedMaximum =
    requested === "safe"
      ? 0
      : requested === "sensitive"
        ? 1
        : requested === "adult"
          ? 2
          : maximum;
  return allRatings.slice(
    0,
    Math.min(maximum, requestedMaximum) + 1,
  ) as readonly ContentRating[];
}

export function presentFeedItem(
  row: FeedRow,
  now: Date,
  hot: boolean,
  historyEnabled: boolean,
) {
  const primary = row.primarySourcePost;
  return {
    alternateSourceCount: Math.max(0, row.sourcePosts.length - 1),
    actionState: presentActionState(row.actions, historyEnabled),
    authorName: row.authorName,
    contentRating: row.contentRating,
    contentWarning: row.contentWarning,
    id: row.id,
    media: row.mediaAssets[0] ? presentMedia(row.mediaAssets[0]) : null,
    publishedAt: row.publishedAt.toISOString(),
    summary: row.summary,
    title: row.title,
    primarySource: primary
      ? {
          displayName: primary.source.displayName,
          kind: primary.source.kind,
          providerUrl: primary.providerUrl,
          sourceId: primary.source.id,
        }
      : null,
    ...(hot ? { ranking: explainHotRanking(row.rankingScore, now) } : {}),
  };
}

function presentDetail(row: ContentRow, historyEnabled: boolean) {
  return {
    ...presentFeedItem(row, new Date(), false, historyEnabled),
    canonicalUrl: row.canonicalUrl,
    media: row.mediaAssets.map(presentMedia),
    sources: row.sourcePosts.map((post) => ({
      externalId: post.externalId,
      firstSeenAt: post.firstSeenAt.toISOString(),
      communityName: post.communityName,
      providerAuthor: post.providerAuthor,
      providerCommentCount: post.providerCommentCount,
      providerPublishedAt: post.providerPublishedAt?.toISOString() ?? null,
      providerScore: post.providerScore,
      providerUrl: post.providerUrl,
      source: post.source,
    })),
    tags: row.tags.map((entry) => ({
      label: entry.tag.label,
      slug: entry.tag.slug,
    })),
  };
}

function presentActionState(
  actions: FeedRow["actions"],
  historyEnabled: boolean,
) {
  const favorite = actions.find((action) => action.kind === "FAVORITE");
  const hidden = actions.find((action) => action.kind === "HIDE");
  const view = historyEnabled
    ? actions.find((action) => action.kind === "VIEW")
    : undefined;
  return {
    favorite: Boolean(favorite),
    hidden: Boolean(hidden),
    viewed: Boolean(view),
    view: view
      ? {
          count: view.occurrenceCount,
          firstViewedAt: view.occurredAt.toISOString(),
          lastViewedAt: view.lastOccurredAt.toISOString(),
        }
      : null,
  };
}

function presentMedia<
  T extends {
    readonly byteLength: bigint | null;
    readonly durationMilliseconds: number | null;
    readonly height: number | null;
    readonly id: string;
    readonly kind: string;
    readonly mimeType: string | null;
    readonly remoteUrl: string;
    readonly width: number | null;
  },
>(asset: T) {
  return {
    altText: null,
    byteLength: asset.byteLength?.toString() ?? null,
    durationMs: asset.durationMilliseconds,
    height: asset.height,
    id: asset.id,
    kind: asset.kind,
    mimeType: asset.mimeType,
    remoteUrl: asset.remoteUrl,
    width: asset.width,
  };
}
