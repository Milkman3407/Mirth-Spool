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
  const ceiling = await readSetting(services.database, "content.maximumRating");
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
    includeSeen: query.includeSeen,
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
    items: page.rows.map((row) => present(row, now, query.mode === "hot")),
    nextCursor,
    ...(seed ? { seed } : {}),
  });
}

export async function readContent(
  services: Services,
  userId: string,
  contentId: string,
) {
  const ceiling = await readSetting(services.database, "content.maximumRating");
  const row = await getFeedContent(services.database, {
    allowedRatings: [...ratingsFor(ceiling)],
    contentId,
    userId,
  });
  return row ? presentDetail(row) : null;
}

function ratingsFor(
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

function present(row: FeedRow, now: Date, hot: boolean) {
  const primary = row.primarySourcePost;
  return {
    alternateSourceCount: Math.max(0, row.sourcePosts.length - 1),
    authorName: row.authorName,
    contentRating: row.contentRating,
    contentWarning: row.contentWarning,
    id: row.id,
    media: row.mediaAssets[0] ?? null,
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

function presentDetail(row: ContentRow) {
  return {
    ...present(row, new Date(), false),
    canonicalUrl: row.canonicalUrl,
    actions: row.actions.map((action) => ({
      kind: action.kind,
      occurredAt: action.occurredAt.toISOString(),
    })),
    media: row.mediaAssets.map((asset) => ({
      ...asset,
      byteLength: asset.byteLength?.toString() ?? null,
    })),
    sources: row.sourcePosts.map((post) => ({
      externalId: post.externalId,
      firstSeenAt: post.firstSeenAt.toISOString(),
      providerAuthor: post.providerAuthor,
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
