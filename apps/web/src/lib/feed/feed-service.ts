import {
  explainHotRanking,
  diversifyRecommendations,
  getFeedContent,
  parseRecommendationFeatures,
  queryFeed,
  queryRecommendationCandidates,
  randomSeedPivot,
  RECOMMENDATION_SCORING_VERSION,
  readSetting,
  readUserPreferences,
  recommendationProfileStatus,
  scoreRecommendation,
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
  const [ceiling, preferences] = await Promise.all([
    readSetting(services.database, "content.maximumRating"),
    readUserPreferences(services.database, userId),
  ]);
  const historyEnabled = preferences.historyEnabled;
  const allowedRatings = ratingsFor(
    ceiling,
    query.rating,
    preferences.maximumContentRating,
  );
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
  if (query.mode === "for-you") {
    const snapshotAt = cursor?.a ? new Date(cursor.a) : now;
    const [profile, weights] = await Promise.all([
      services.database.recommendationProfile.findUnique({
        where: { userId },
      }),
      readSetting(services.database, "recommendations.weights"),
    ]);
    const status = recommendationProfileStatus(
      profile,
      preferences.recommendationsEnabled,
      now,
    );
    if (
      cursor &&
      (cursor.a === undefined ||
        cursor.sv !== RECOMMENDATION_SCORING_VERSION ||
        cursor.q !== profile?.computedAt.toISOString())
    )
      throw new Error("INVALID_CURSOR");
    const candidates = await queryRecommendationCandidates(services.database, {
      allowedRatings: [...allowedRatings],
      ...(query.from ? { from: query.from } : {}),
      includeSeen: query.includeSeen || !historyEnabled,
      mediaKinds: query.kinds,
      snapshotAt,
      sourceIds: query.sourceIds,
      tags: query.tags,
      ...(query.to ? { to: query.to } : {}),
      userId,
    });
    const features =
      status === "personalized" && profile
        ? parseRecommendationFeatures(profile.featuresJson)
        : { media: {}, sources: {}, tags: {} };
    const scored = candidates.map((row) => {
      const scoredItem = scoreRecommendation(
        {
          id: row.id,
          mediaKind: row.mediaAssets[0]?.kind ?? null,
          publishedAt: row.publishedAt,
          sourceId: row.primarySourcePost?.source.id ?? null,
          sourcePriority: row.primarySourcePost?.source.priority ?? 0,
          tagSlugs: row.tags.map((entry) => entry.tag.slug),
        },
        features,
        weights,
        snapshotAt,
      );
      return { row, ...scoredItem };
    });
    if (status === "personalized")
      scored.sort(
        (left, right) =>
          right.score - left.score ||
          right.row.publishedAt.valueOf() - left.row.publishedAt.valueOf() ||
          right.row.id.localeCompare(left.row.id),
      );
    const diversified =
      status === "personalized"
        ? diversifyRecommendations(
            scored.map((item) => ({
              ...item,
              id: item.row.id,
              mediaKind: item.row.mediaAssets[0]?.kind ?? null,
              publishedAt: item.row.publishedAt,
              sourceId: item.row.primarySourcePost?.source.id ?? null,
              sourcePriority: item.row.primarySourcePost?.source.priority ?? 0,
              tagSlugs: item.row.tags.map((entry) => entry.tag.slug),
            })),
            scored.length,
          )
        : scored;
    const start = cursor
      ? diversified.findIndex((item) => item.row.id === cursor.i) + 1
      : 0;
    if (cursor && start === 0) throw new Error("INVALID_CURSOR");
    const page = diversified.slice(start, start + query.limit);
    const hasMore = start + query.limit < diversified.length;
    const last = page.at(-1);
    return Object.freeze({
      hasMore,
      items: page.map((item) => ({
        ...presentFeedItem(item.row, snapshotAt, false, historyEnabled),
        ...(status === "personalized"
          ? {
              recommendation: {
                explanations: item.explanations,
                score: item.score,
                scoringVersion: RECOMMENDATION_SCORING_VERSION,
              },
            }
          : {}),
      })),
      nextCursor:
        hasMore && last
          ? encodeFeedCursor(
              {
                a: snapshotAt.toISOString(),
                f: query.fingerprint,
                i: last.row.id,
                m: "for-you",
                q: profile?.computedAt.toISOString(),
                sv: RECOMMENDATION_SCORING_VERSION,
                v: 1,
              },
              services.secret,
            )
          : null,
      personalization: {
        reason: status,
        scoringVersion: RECOMMENDATION_SCORING_VERSION,
      },
      seed: undefined,
    });
  }
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
    personalization: undefined,
    ...(seed ? { seed } : {}),
  });
}

export async function readContent(
  services: Services,
  userId: string,
  contentId: string,
) {
  const [ceiling, preferences] = await Promise.all([
    readSetting(services.database, "content.maximumRating"),
    readUserPreferences(services.database, userId),
  ]);
  const row = await getFeedContent(services.database, {
    allowedRatings: [
      ...ratingsFor(ceiling, undefined, preferences.maximumContentRating),
    ],
    contentId,
    userId,
  });
  return row ? presentDetail(row, preferences.historyEnabled) : null;
}

export function ratingsFor(
  ceiling: string,
  requested?: string,
  userCeiling = ceiling,
): readonly ContentRating[] {
  const levels = { SAFE: 0, SENSITIVE: 1, ADULT: 2, UNKNOWN: 3 } as const;
  const maximum = Math.min(
    levels[ceiling as keyof typeof levels] ?? 0,
    levels[userCeiling as keyof typeof levels] ?? 0,
  );
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
  const groupedItems = row.duplicateGroup?.items;
  const occurrences = groupedItems
    ? groupedItems.flatMap((item) => item.sourcePosts)
    : row.sourcePosts;
  const actions = groupedItems
    ? groupedItems.flatMap((item) => item.actions)
    : row.actions;
  return {
    alternateSourceCount: Math.max(0, occurrences.length - 1),
    actionState: presentActionState(actions, historyEnabled),
    authorName: row.authorName,
    contentRating: row.contentRating,
    contentWarning: row.contentWarning,
    duplicateGroup: row.duplicateGroup
      ? {
          id: row.duplicateGroup.id,
          itemCount: row.duplicateGroup.items.length,
        }
      : null,
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
    recommendation: undefined,
    ...(hot ? { ranking: explainHotRanking(row.rankingScore, now) } : {}),
  };
}

function presentDetail(row: ContentRow, historyEnabled: boolean) {
  const groupedItems = row.duplicateGroup?.items;
  const sourcePosts = groupedItems
    ? groupedItems.flatMap((item) => item.sourcePosts)
    : row.sourcePosts;
  const tagEntries = groupedItems
    ? groupedItems.flatMap((item) => item.tags)
    : row.tags;
  const tags = [
    ...new Map(tagEntries.map((entry) => [entry.tag.slug, entry.tag])).values(),
  ];
  return {
    ...presentFeedItem(row, new Date(), false, historyEnabled),
    canonicalUrl: row.canonicalUrl,
    media: row.mediaAssets.map(presentMedia),
    sources: sourcePosts.map((post) => ({
      boostedBy: post.boostedBy,
      externalId: post.externalId,
      firstSeenAt: post.firstSeenAt.toISOString(),
      communityName: post.communityName,
      providerAuthor: post.providerAuthor,
      providerCommentCount: post.providerCommentCount,
      providerFavouriteCount: post.providerFavouriteCount,
      providerLanguage: post.providerLanguage,
      providerPublishedAt: post.providerPublishedAt?.toISOString() ?? null,
      providerScore: post.providerScore,
      providerShareCount: post.providerShareCount,
      providerUrl: post.providerUrl,
      source: post.source,
    })),
    tags: tags.map((tag) => ({
      label: tag.label,
      slug: tag.slug,
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
    readonly altText: string | null;
    readonly byteLength: bigint | null;
    readonly cacheState: string;
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
    altText: asset.altText,
    byteLength: asset.byteLength?.toString() ?? null,
    cacheState: asset.cacheState,
    durationMs: asset.durationMilliseconds,
    height: asset.height,
    id: asset.id,
    kind: asset.kind,
    mimeType: asset.mimeType,
    remoteUrl: asset.remoteUrl,
    renderUrl:
      asset.cacheState === "CACHED"
        ? `/api/media/${asset.id}`
        : asset.remoteUrl,
    width: asset.width,
  };
}
