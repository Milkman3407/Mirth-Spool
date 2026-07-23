import { z } from "zod";

import type { Prisma, PrismaClient } from "./generated/prisma/client.js";
import { prioritySignal } from "./feed-ranking.js";
import type { SettingValue } from "./settings.js";
import { readSetting } from "./settings.js";

export const RECOMMENDATION_SCORING_VERSION = 1;
export const RECOMMENDATION_ACTION_LIMIT = 5_000;
export const RECOMMENDATION_FEATURE_LIMIT = 100;
export const RECOMMENDATION_PROFILE_STALE_MS = 25 * 60 * 60 * 1_000;

const featureSchema = z
  .object({
    media: z.record(z.string(), z.number().finite()).default({}),
    sources: z.record(z.string(), z.number().finite()).default({}),
    tags: z.record(z.string(), z.number().finite()).default({}),
  })
  .strict();

export type RecommendationFeatures = z.output<typeof featureSchema>;
export type RecommendationWeights = SettingValue<"recommendations.weights">;

export type RecommendationCandidate = Readonly<{
  id: string;
  mediaKind: string | null;
  publishedAt: Date;
  sourceId: string | null;
  sourcePriority: number;
  tagSlugs: readonly string[];
}>;

export type RecommendationExplanation = Readonly<{
  factor: "freshness" | "media" | "source" | "source-priority" | "tag";
  label: string;
  contribution: number;
}>;

export function scoreRecommendation(
  candidate: RecommendationCandidate,
  features: RecommendationFeatures,
  weights: RecommendationWeights,
  now: Date,
) {
  const factors: RecommendationExplanation[] = [];
  const contributions: number[] = [];
  const sourceAffinity = candidate.sourceId
    ? (features.sources[candidate.sourceId] ?? 0)
    : 0;
  addFactor(
    factors,
    contributions,
    "source",
    "A source you tend to enjoy",
    "Less like sources you hide",
    sourceAffinity * weights.source,
  );
  const tagAffinity = strongestAffinity(
    candidate.tagSlugs.map((tag) => features.tags[tag] ?? 0),
  );
  addFactor(
    factors,
    contributions,
    "tag",
    "Topics similar to your activity",
    "Less like topics you hide",
    tagAffinity * weights.tag,
  );
  const mediaAffinity = candidate.mediaKind
    ? (features.media[candidate.mediaKind] ?? 0)
    : 0;
  addFactor(
    factors,
    contributions,
    "media",
    "A media format you tend to enjoy",
    "Less like media formats you hide",
    mediaAffinity * weights.media,
  );
  const ageHours = Math.max(
    0,
    (now.valueOf() - candidate.publishedAt.valueOf()) / 3_600_000,
  );
  const freshness = Math.exp(-ageHours / 72) * weights.freshness;
  addFactor(
    factors,
    contributions,
    "freshness",
    "Recently published",
    "Older content",
    freshness,
  );
  addFactor(
    factors,
    contributions,
    "source-priority",
    "From a preferred configured source",
    "From a lower-priority configured source",
    Math.max(0, prioritySignal(candidate.sourcePriority)) *
      weights.sourcePriority,
  );
  factors.sort(
    (left, right) =>
      right.contribution - left.contribution ||
      left.factor.localeCompare(right.factor),
  );
  const score = contributions.reduce(
    (total, contribution) => total + contribution,
    0,
  );
  return Object.freeze({
    explanations: Object.freeze(factors.slice(0, 3)),
    score: Number(Math.max(0, Math.min(20, score)).toFixed(6)),
  });
}

export function diversifyRecommendations<T extends RecommendationCandidate>(
  ranked: readonly T[],
  limit: number,
): readonly T[] {
  const remaining = [...ranked];
  const selected: T[] = [];
  while (remaining.length > 0 && selected.length < limit) {
    const recent = selected.slice(-3);
    let index = remaining.findIndex(
      (candidate) =>
        !candidate.sourceId ||
        recent.filter((item) => item.sourceId === candidate.sourceId).length <
          2,
    );
    if (index < 0) index = 0;
    selected.push(remaining.splice(index, 1)[0]!);
  }
  return Object.freeze(selected);
}

export function parseRecommendationFeatures(
  input: unknown,
): RecommendationFeatures {
  return featureSchema.parse(input);
}

export function recommendationProfileStatus(
  profile: { computedAt: Date; explicitActionCount: number } | null,
  enabled: boolean,
  now: Date,
) {
  if (!enabled) return "disabled" as const;
  if (!profile || profile.explicitActionCount < 1) return "cold-start" as const;
  if (
    now.valueOf() - profile.computedAt.valueOf() >
    RECOMMENDATION_PROFILE_STALE_MS
  )
    return "stale" as const;
  return "personalized" as const;
}

export async function rebuildRecommendationProfiles(
  client: PrismaClient,
  now = new Date(),
  userLimit = 100,
) {
  z.number().int().min(1).max(500).parse(userLimit);
  const weights = await readSetting(client, "recommendations.weights");
  const enabledWhere: Prisma.UserWhereInput = {
    OR: [
      { preferences: null },
      { preferences: { recommendationsEnabled: true } },
    ],
  };
  const selection = {
    id: true,
    preferences: {
      select: {
        recommendationResetAt: true,
        recommendationsEnabled: true,
      },
    },
  } as const;
  const usersWithoutProfiles = await client.user.findMany({
    orderBy: { id: "asc" },
    select: selection,
    take: userLimit,
    where: {
      AND: [enabledWhere, { recommendationProfile: null }],
    },
  });
  const usersWithProfiles =
    usersWithoutProfiles.length < userLimit
      ? await client.user.findMany({
          orderBy: [
            { recommendationProfile: { computedAt: "asc" } },
            { id: "asc" },
          ],
          select: selection,
          take: userLimit - usersWithoutProfiles.length,
          where: {
            AND: [enabledWhere, { recommendationProfile: { isNot: null } }],
          },
        })
      : [];
  const users = [...usersWithoutProfiles, ...usersWithProfiles];
  for (const user of users) {
    const actions = await client.userAction.findMany({
      include: {
        contentItem: {
          select: {
            mediaAssets: {
              orderBy: { ordinal: "asc" },
              select: { kind: true },
              take: 1,
            },
            primarySourcePost: { select: { sourceId: true } },
            tags: { select: { tag: { select: { slug: true } } } },
          },
        },
      },
      orderBy: [{ lastOccurredAt: "desc" }, { id: "desc" }],
      take: RECOMMENDATION_ACTION_LIMIT + 1,
      where: {
        userId: user.id,
        ...(user.preferences?.recommendationResetAt
          ? { lastOccurredAt: { gt: user.preferences.recommendationResetAt } }
          : {}),
      },
    });
    const sampled = actions.slice(0, RECOMMENDATION_ACTION_LIMIT);
    const maps = {
      media: new Map<string, number>(),
      sources: new Map<string, number>(),
      tags: new Map<string, number>(),
    };
    let explicitActionCount = 0;
    for (const action of sampled) {
      const signal =
        action.kind === "FAVORITE"
          ? weights.favorite
          : action.kind === "HIDE"
            ? weights.hide
            : weights.view;
      if (action.kind !== "VIEW") explicitActionCount += 1;
      addMap(
        maps.sources,
        action.contentItem.primarySourcePost?.sourceId,
        signal,
      );
      addMap(maps.media, action.contentItem.mediaAssets[0]?.kind, signal);
      for (const tag of action.contentItem.tags)
        addMap(maps.tags, tag.tag.slug, signal);
    }
    const features = {
      media: boundedRecord(maps.media),
      sources: boundedRecord(maps.sources),
      tags: boundedRecord(maps.tags),
    };
    await client.recommendationProfile.upsert({
      create: {
        computedAt: now,
        explicitActionCount,
        featuresJson: features as Prisma.InputJsonValue,
        lastActionAt: sampled[0]?.lastOccurredAt ?? null,
        sampledActionCount: sampled.length,
        scoringVersion: RECOMMENDATION_SCORING_VERSION,
        truncated: actions.length > RECOMMENDATION_ACTION_LIMIT,
        userId: user.id,
      },
      update: {
        computedAt: now,
        explicitActionCount,
        featuresJson: features as Prisma.InputJsonValue,
        lastActionAt: sampled[0]?.lastOccurredAt ?? null,
        sampledActionCount: sampled.length,
        scoringVersion: RECOMMENDATION_SCORING_VERSION,
        truncated: actions.length > RECOMMENDATION_ACTION_LIMIT,
      },
      where: { userId: user.id },
    });
  }
  return Object.freeze({ processedUsers: users.length });
}

function addFactor(
  factors: RecommendationExplanation[],
  contributions: number[],
  factor: RecommendationExplanation["factor"],
  positiveLabel: string,
  negativeLabel: string,
  contribution: number,
) {
  contributions.push(contribution);
  if (Math.abs(contribution) > 0.000_001)
    factors.push({
      contribution: Number(Math.abs(contribution).toFixed(6)),
      factor,
      label: contribution > 0 ? positiveLabel : negativeLabel,
    });
}

function strongestAffinity(values: readonly number[]): number {
  return values.reduce(
    (strongest, value) =>
      Math.abs(value) > Math.abs(strongest) ? value : strongest,
    0,
  );
}

function addMap(
  map: Map<string, number>,
  key: string | undefined,
  value: number,
) {
  if (key)
    map.set(key, Math.max(-20, Math.min(20, (map.get(key) ?? 0) + value)));
}

function boundedRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...map.entries()]
      .sort(
        (left, right) =>
          Math.abs(right[1]) - Math.abs(left[1]) ||
          left[0].localeCompare(right[0]),
      )
      .slice(0, RECOMMENDATION_FEATURE_LIMIT)
      .map(([key, value]) => [key, Number((value / 5).toFixed(4))]),
  );
}
