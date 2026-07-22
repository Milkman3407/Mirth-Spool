import type {
  CacheState,
  ContentRating,
  MediaKind,
} from "../generated/prisma/client.js";
import type { RepositoryClient } from "../repository-types.js";
import { readSetting } from "../settings.js";

export interface CacheConfiguration {
  readonly allowedKinds: readonly ("ANIMATED_IMAGE" | "IMAGE" | "VIDEO")[];
  readonly maxObjectBytes: number;
  readonly policy: "ALL_WITHIN_QUOTA" | "FAVORITES_ONLY" | "NONE" | "TTL";
  readonly quotaBytes: number;
  readonly ttlSeconds: number;
}

export async function readCacheConfiguration(
  client: RepositoryClient,
): Promise<CacheConfiguration> {
  const [allowedKinds, maxObjectBytes, policy, quotaBytes, ttlSeconds] =
    await Promise.all([
      readSetting(client, "cache.allowedKinds"),
      readSetting(client, "cache.maxObjectBytes"),
      readSetting(client, "cache.policy"),
      readSetting(client, "cache.quotaBytes"),
      readSetting(client, "cache.ttlSeconds"),
    ]);
  return Object.freeze({
    allowedKinds: Object.freeze([...allowedKinds]),
    maxObjectBytes,
    policy,
    quotaBytes,
    ttlSeconds,
  });
}

export async function getCacheSummary(client: RepositoryClient) {
  const [configuration, states, cached] = await Promise.all([
    readCacheConfiguration(client),
    client.mediaAsset.groupBy({ by: ["cacheState"], _count: { _all: true } }),
    client.mediaAsset.aggregate({
      _sum: { byteLength: true },
      where: { cacheState: "CACHED" },
    }),
  ]);
  const counts = Object.fromEntries(
    states.map((row) => [row.cacheState, row._count._all]),
  ) as Partial<Record<CacheState, number>>;
  return Object.freeze({
    configuration,
    counts: Object.freeze({
      blocked: counts.BLOCKED ?? 0,
      cached: counts.CACHED ?? 0,
      failed: counts.FAILED ?? 0,
      fetching: counts.FETCHING ?? 0,
      queued: counts.QUEUED ?? 0,
      remoteOnly: counts.REMOTE_ONLY ?? 0,
    }),
    usedBytes: Number(cached._sum.byteLength ?? 0n),
  });
}

export function listCacheSchedulingCandidates(
  client: RepositoryClient,
  input: {
    readonly allowedKinds: readonly MediaKind[];
    readonly limit: number;
  },
) {
  return client.mediaAsset.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      contentItem: {
        select: {
          actions: {
            select: { id: true },
            take: 1,
            where: { kind: "FAVORITE" },
          },
        },
      },
      id: true,
      kind: true,
    },
    take: Math.min(250, Math.max(1, input.limit)),
    where: {
      cacheState: { in: ["EVICTED", "REMOTE_ONLY"] },
      contentItem: { status: "ACTIVE" },
      kind: { in: [...input.allowedKinds] },
    },
  });
}

export function markMediaQueued(client: RepositoryClient, mediaId: string) {
  return client.mediaAsset.updateMany({
    data: { cacheErrorCode: null, cacheState: "QUEUED" },
    where: {
      cacheState: { in: ["EVICTED", "REMOTE_ONLY"] },
      id: mediaId,
    },
  });
}

export function resetQueuedMedia(client: RepositoryClient, mediaId: string) {
  return client.mediaAsset.updateMany({
    data: { cacheState: "REMOTE_ONLY" },
    where: { cacheState: "QUEUED", id: mediaId },
  });
}

export function getMediaForDelivery(
  client: RepositoryClient,
  input: {
    readonly allowedRatings: readonly ContentRating[];
    readonly mediaId: string;
  },
) {
  return client.mediaAsset.findFirst({
    select: {
      byteLength: true,
      cacheState: true,
      contentItem: { select: { contentRating: true, status: true } },
      id: true,
      kind: true,
      mimeType: true,
      sha256: true,
      storageKey: true,
    },
    where: {
      cacheState: "CACHED",
      contentItem: {
        contentRating: { in: [...input.allowedRatings] },
        status: { in: ["ACTIVE", "REMOVED_AT_SOURCE"] },
      },
      id: input.mediaId,
      storageKey: { not: null },
    },
  });
}

export function touchMediaAccess(
  client: RepositoryClient,
  mediaId: string,
  now: Date,
  minimumIntervalMilliseconds = 300_000,
) {
  return client.mediaAsset.updateMany({
    data: { lastAccessedAt: now },
    where: {
      cacheState: "CACHED",
      id: mediaId,
      OR: [
        { lastAccessedAt: null },
        {
          lastAccessedAt: {
            lt: new Date(now.valueOf() - minimumIntervalMilliseconds),
          },
        },
      ],
    },
  });
}
