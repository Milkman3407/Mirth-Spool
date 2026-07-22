import { randomUUID } from "node:crypto";
import { z } from "zod";

import type {
  Prisma,
  PrismaClient,
  RunStatus,
  RunTrigger,
} from "../generated/prisma/client.js";
import type { NormalizedContentInput } from "./content.js";
import { contentRandomKey, hotRankingCoordinate } from "../feed-ranking.js";

const checkpointScope = "poll";

export interface IngestionPageInput {
  readonly checkpoint: Prisma.InputJsonValue | null;
  readonly items: readonly NormalizedContentInput[];
  readonly sourceId: string;
}

export async function listDueSources(
  client: PrismaClient,
  now: Date,
  limit = 100,
) {
  return client.source.findMany({
    orderBy: [{ priority: "desc" }, { nextPollAt: "asc" }, { id: "asc" }],
    select: { id: true, nextPollAt: true },
    take: z.number().int().min(1).max(500).parse(limit),
    where: {
      deletedAt: null,
      enabled: true,
      OR: [{ nextPollAt: null }, { nextPollAt: { lte: now } }],
    },
  });
}

export async function claimIngestionRun(
  client: PrismaClient,
  input: {
    readonly attempt: number;
    readonly jobId: string;
    readonly sourceId: string;
    readonly staleBefore: Date;
    readonly startedAt: Date;
    readonly trigger: RunTrigger;
  },
) {
  try {
    return await client.$transaction(async (transaction) => {
      await transaction.ingestionRun.updateMany({
        data: {
          errorCode: "RUN_LEASE_EXPIRED",
          errorMessage:
            "The previous worker stopped before completing this run.",
          finishedAt: input.startedAt,
          status: "CANCELLED",
        },
        where: {
          sourceId: input.sourceId,
          startedAt: { lt: input.staleBefore },
          status: "RUNNING",
        },
      });
      const source = await transaction.source.findFirst({
        include: {
          checkpoints: { where: { scope: checkpointScope } },
          credentials: true,
        },
        where: { deletedAt: null, enabled: true, id: input.sourceId },
      });
      if (!source) return null;
      const run = await transaction.ingestionRun.create({
        data: {
          attempt: z.number().int().min(1).max(100).parse(input.attempt),
          jobId: z.string().min(1).max(200).parse(input.jobId),
          sourceId: source.id,
          startedAt: input.startedAt,
          trigger: input.trigger,
        },
      });
      return { run, source } as const;
    });
  } catch (error) {
    if (isPrismaCode(error, "P2002")) return null;
    throw error;
  }
}

export async function persistIngestionPage(
  client: PrismaClient,
  input: IngestionPageInput,
  now: Date,
): Promise<Readonly<{ created: number; updated: number }>> {
  z.uuid().parse(input.sourceId);
  z.number().int().min(0).max(200).parse(input.items.length);
  return client.$transaction(
    async (transaction) => {
      const source = await transaction.source.findUniqueOrThrow({
        select: { priority: true },
        where: { id: input.sourceId },
      });
      let created = 0;
      let updated = 0;
      for (const item of input.items) {
        if (item.sourceId !== input.sourceId)
          throw new TypeError("Ingestion source mismatch.");
        const existing = await transaction.sourcePost.findUnique({
          where: {
            sourceId_externalId: {
              externalId: item.externalId,
              sourceId: input.sourceId,
            },
          },
        });
        if (existing) {
          await transaction.sourcePost.update({
            data: {
              ...occurrenceData(item, now),
              providerDeletedAt: item.providerDeletedAt
                ? (existing.providerDeletedAt ?? item.providerDeletedAt)
                : null,
            },
            where: { id: existing.id },
          });
          const activeOccurrences = await transaction.sourcePost.count({
            where: {
              contentItemId: existing.contentItemId,
              providerDeletedAt: null,
            },
          });
          await transaction.contentItem.update({
            data: {
              ...contentData(item, now, source.priority),
              status: activeOccurrences > 0 ? "ACTIVE" : "REMOVED_AT_SOURCE",
            },
            where: { id: existing.contentItemId },
          });
          await transaction.mediaAsset.deleteMany({
            where: { contentItemId: existing.contentItemId },
          });
          await createMedia(transaction, existing.contentItemId, item);
          updated += 1;
        } else {
          const contentId = randomUUID();
          const content = await transaction.contentItem.create({
            data: {
              ...contentData(item, now, source.priority),
              id: contentId,
              randomKey: contentRandomKey(contentId),
            },
          });
          const occurrence = await transaction.sourcePost.create({
            data: {
              ...occurrenceData(item, now),
              contentItemId: content.id,
              sourceId: input.sourceId,
            },
          });
          await createMedia(transaction, content.id, item);
          await transaction.contentItem.update({
            data: { primarySourcePostId: occurrence.id },
            where: { id: content.id },
          });
          created += 1;
        }
      }
      if (input.checkpoint !== null) {
        await transaction.sourceCheckpoint.upsert({
          create: {
            scope: checkpointScope,
            sourceId: input.sourceId,
            valueJson: input.checkpoint,
          },
          update: { valueJson: input.checkpoint },
          where: {
            sourceId_scope: {
              scope: checkpointScope,
              sourceId: input.sourceId,
            },
          },
        });
      }
      return Object.freeze({ created, updated });
    },
    { isolationLevel: "Serializable", maxWait: 5_000, timeout: 20_000 },
  );
}

export async function finalizeIngestionRun(
  client: PrismaClient,
  input: {
    readonly errorCode?: string;
    readonly errorMessage?: string;
    readonly finishedAt: Date;
    readonly nextPollAt: Date;
    readonly rateLimitResetAt?: Date;
    readonly runId: string;
    readonly sourceStatus:
      | "ACTIVE"
      | "AUTH_ERROR"
      | "CONFIG_ERROR"
      | "DEGRADED";
    readonly stats: Readonly<{
      bytesFetched: bigint;
      itemsCreated: number;
      itemsSeen: number;
      itemsSkipped: number;
      itemsUpdated: number;
      pagesFetched: number;
      providerRequests: number;
    }>;
    readonly status: Exclude<RunStatus, "RUNNING">;
    readonly succeeded: boolean;
  },
): Promise<void> {
  await client.$transaction(async (transaction) => {
    const run = await transaction.ingestionRun.update({
      data: {
        ...input.stats,
        errorCode: input.errorCode?.slice(0, 100) ?? null,
        errorMessage: input.errorMessage?.slice(0, 500) ?? null,
        finishedAt: input.finishedAt,
        rateLimitResetAt: input.rateLimitResetAt ?? null,
        status: input.status,
      },
      where: { id: input.runId },
    });
    await transaction.source.update({
      data: input.succeeded
        ? {
            consecutiveFailures: 0,
            lastAttemptAt: input.finishedAt,
            lastErrorCode: null,
            lastErrorMessage: null,
            lastSuccessAt: input.finishedAt,
            nextPollAt: input.nextPollAt,
            status: input.sourceStatus,
          }
        : {
            consecutiveFailures: { increment: 1 },
            lastAttemptAt: input.finishedAt,
            lastErrorCode: input.errorCode?.slice(0, 100) ?? "INGESTION_FAILED",
            lastErrorMessage:
              input.errorMessage?.slice(0, 500) ?? "The source poll failed.",
            nextPollAt: input.nextPollAt,
            status: input.sourceStatus,
          },
      where: { id: run.sourceId },
    });
  });
}

export function listIngestionRuns(
  client: PrismaClient,
  input: {
    readonly cursor?: string;
    readonly limit: number;
    readonly sourceId: string;
  },
) {
  return client.ingestionRun.findMany({
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: z.number().int().min(1).max(100).parse(input.limit),
    where: { sourceId: z.uuid().parse(input.sourceId) },
  });
}

export function cleanupIngestionRuns(client: PrismaClient, olderThan: Date) {
  return client.ingestionRun.deleteMany({
    where: { finishedAt: { lt: olderThan }, status: { not: "RUNNING" } },
  });
}

function contentData(
  item: NormalizedContentInput,
  now: Date,
  sourcePriority: number,
) {
  return {
    authorName: item.authorName ?? null,
    canonicalUrl: item.canonicalUrl ?? null,
    canonicalUrlHash: item.canonicalUrlHash ?? null,
    contentRating: item.contentRating,
    contentWarning: item.contentWarning ?? null,
    lastSeenAt: now,
    normalizedTitle: item.normalizedTitle ?? null,
    publishedAt: item.publishedAt,
    rankingScore: hotRankingCoordinate({
      providerScore: item.providerScore,
      publishedAt: item.publishedAt,
      sourcePriority,
    }),
    status: item.status ?? ("ACTIVE" as const),
    summary: item.summary ?? null,
    title: item.title ?? null,
  };
}

function occurrenceData(item: NormalizedContentInput, now: Date) {
  return {
    boostedBy: item.boostedBy ?? null,
    externalId: item.externalId,
    communityName: item.communityName ?? null,
    lastSeenAt: now,
    providerAuthor: item.providerAuthor ?? null,
    providerPublishedAt: item.providerPublishedAt ?? null,
    providerDeletedAt: item.providerDeletedAt ?? null,
    providerCommentCount: item.providerCommentCount ?? null,
    providerFavouriteCount: item.providerFavouriteCount ?? null,
    providerLanguage: item.providerLanguage ?? null,
    providerScore: item.providerScore ?? null,
    providerShareCount: item.providerShareCount ?? null,
    providerUpdatedAt: item.providerUpdatedAt ?? null,
    providerUrl: item.providerUrl ?? null,
  };
}

async function createMedia(
  transaction: Prisma.TransactionClient,
  contentItemId: string,
  item: NormalizedContentInput,
): Promise<void> {
  if (item.media.length === 0) return;
  await transaction.mediaAsset.createMany({
    data: item.media.map((asset) => ({
      ...asset,
      contentItemId,
    })),
  });
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
