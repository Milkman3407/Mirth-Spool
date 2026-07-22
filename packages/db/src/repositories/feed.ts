import { z } from "zod";

import type {
  ContentRating,
  MediaKind,
  Prisma,
  PrismaClient,
} from "../generated/prisma/client.js";

export type FeedMode = "hot" | "new" | "random" | "unseen";
export type FeedPosition = Readonly<{
  id: string;
  publishedAt?: Date;
  randomKey?: number;
  rankingScore?: number;
}>;

export interface FeedQuery {
  readonly allowedRatings: readonly ContentRating[];
  readonly from?: Date;
  readonly includeSeen?: boolean;
  readonly limit: number;
  readonly mediaKinds?: readonly MediaKind[];
  readonly mode: FeedMode;
  readonly position?: FeedPosition;
  readonly randomPivot?: number;
  readonly randomWrapped?: boolean;
  readonly sourceIds?: readonly string[];
  readonly tags?: readonly string[];
  readonly to?: Date;
  readonly userId: string;
}

const feedInclude = {
  mediaAssets: {
    orderBy: [{ ordinal: "asc" as const }, { id: "asc" as const }],
  },
  primarySourcePost: {
    include: {
      source: { select: { displayName: true, id: true, kind: true } },
    },
  },
  sourcePosts: { select: { id: true } },
  tags: { include: { tag: true }, orderBy: { tagId: "asc" as const } },
} satisfies Prisma.ContentItemInclude;

export async function queryFeed(client: PrismaClient, input: FeedQuery) {
  z.number().int().min(1).max(50).parse(input.limit);
  z.uuid().parse(input.userId);
  const where = feedWhere(input);
  const rows = await client.contentItem.findMany({
    include: feedInclude,
    orderBy: orderFor(input.mode),
    take: input.limit + 1,
    where,
  });
  return Object.freeze({
    hasMore: rows.length > input.limit,
    rows: rows.slice(0, input.limit),
  });
}

export function getFeedContent(
  client: PrismaClient,
  input: {
    readonly allowedRatings: readonly ContentRating[];
    readonly contentId: string;
    readonly userId: string;
  },
) {
  return client.contentItem.findFirst({
    include: {
      ...feedInclude,
      actions: {
        where: { userId: input.userId },
        select: { kind: true, occurredAt: true },
      },
      sourcePosts: {
        include: {
          source: { select: { displayName: true, id: true, kind: true } },
        },
        orderBy: [{ firstSeenAt: "asc" }, { id: "asc" }],
      },
    },
    where: {
      actions: { none: { kind: "HIDE", userId: input.userId } },
      contentRating: { in: [...input.allowedRatings] },
      id: z.uuid().parse(input.contentId),
      status: "ACTIVE",
    },
  });
}

function feedWhere(input: FeedQuery): Prisma.ContentItemWhereInput {
  const AND: Prisma.ContentItemWhereInput[] = [
    { status: "ACTIVE" },
    { contentRating: { in: [...input.allowedRatings] } },
    { actions: { none: { kind: "HIDE", userId: input.userId } } },
  ];
  if (input.mode === "unseen" && !input.includeSeen)
    AND.push({ actions: { none: { kind: "VIEW", userId: input.userId } } });
  if (input.from || input.to)
    AND.push({
      publishedAt: {
        ...(input.from ? { gte: input.from } : {}),
        ...(input.to ? { lte: input.to } : {}),
      },
    });
  if (input.sourceIds?.length)
    AND.push({
      sourcePosts: { some: { sourceId: { in: [...input.sourceIds] } } },
    });
  if (input.mediaKinds?.length)
    AND.push({
      mediaAssets: { some: { kind: { in: [...input.mediaKinds] } } },
    });
  if (input.tags?.length)
    AND.push({ tags: { some: { tag: { slug: { in: [...input.tags] } } } } });
  const position = input.position;
  if (
    position?.publishedAt &&
    (input.mode === "new" || input.mode === "unseen")
  ) {
    const publishedAt = position.publishedAt;
    AND.push({
      OR: [
        { publishedAt: { lt: publishedAt } },
        { id: { lt: position.id }, publishedAt },
      ],
    });
  }
  if (
    position?.publishedAt &&
    position.rankingScore !== undefined &&
    input.mode === "hot"
  ) {
    const publishedAt = position.publishedAt;
    const rankingScore = position.rankingScore;
    AND.push({
      OR: [
        { rankingScore: { lt: rankingScore } },
        { publishedAt: { lt: publishedAt }, rankingScore },
        { id: { lt: position.id }, publishedAt, rankingScore },
      ],
    });
  }
  if (input.mode === "random") {
    const pivot = input.randomPivot ?? 0;
    const key = position?.randomKey ?? (input.randomWrapped ? -1 : pivot);
    const id = position?.id;
    if (input.randomWrapped) {
      AND.push({
        OR: [
          { randomKey: { gt: key, lt: pivot } },
          ...(id ? [{ id: { gt: id }, randomKey: key }] : []),
        ],
      });
    } else {
      AND.push({
        OR: [
          { randomKey: { gt: key } },
          ...(id ? [{ id: { gt: id }, randomKey: key }] : [{ randomKey: key }]),
        ],
      });
    }
  }
  return { AND };
}

function orderFor(
  mode: FeedMode,
): Prisma.ContentItemOrderByWithRelationInput[] {
  if (mode === "hot")
    return [{ rankingScore: "desc" }, { publishedAt: "desc" }, { id: "desc" }];
  if (mode === "random") return [{ randomKey: "asc" }, { id: "asc" }];
  return [{ publishedAt: "desc" }, { id: "desc" }];
}
