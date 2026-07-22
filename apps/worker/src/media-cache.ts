import {
  readCacheConfiguration,
  listCacheSchedulingCandidates,
  markMediaQueued,
  resetQueuedMedia,
  type DatabaseClient,
} from "@mirthspool/db";
import {
  assertMediaCacheJobData,
  enqueueMediaCache,
  type MediaCacheEnqueuer,
  type MediaCacheJobData,
} from "@mirthspool/redis";
import {
  createStorageKey,
  MediaCacheError,
  MediaStreamVerifier,
  selectEvictions,
  shouldCacheMedia,
  type HardenedMediaClient,
  type PreparedStorageWrite,
  type StorageAdapter,
} from "@mirthspool/storage";
import { UnrecoverableError, type Job } from "bullmq";

const quotaLockId = 6_542_147_030_313;

export interface MediaCacheLogger {
  error(event: string, fields?: Readonly<Record<string, unknown>>): void;
  info(event: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(event: string, fields?: Readonly<Record<string, unknown>>): void;
}

export async function scheduleMediaCache(
  database: DatabaseClient,
  queue: MediaCacheEnqueuer,
  now: Date,
  limit = 50,
): Promise<number> {
  const configuration = await readCacheConfiguration(database);
  if (configuration.policy === "NONE") return 0;
  const candidates = await listCacheSchedulingCandidates(database, {
    allowedKinds: configuration.allowedKinds,
    limit,
  });
  let queued = 0;
  for (const candidate of candidates) {
    if (
      !shouldCacheMedia({
        favorite: candidate.contentItem.actions.length > 0,
        kind: candidate.kind,
        policy: configuration,
      })
    ) {
      continue;
    }
    const claimed = await markMediaQueued(database, candidate.id);
    if (claimed.count === 0) continue;
    try {
      await enqueueMediaCache(queue, {
        mediaId: candidate.id,
        requestedAt: now.toISOString(),
      });
      queued += 1;
    } catch (error) {
      await resetQueuedMedia(database, candidate.id);
      throw error;
    }
  }
  return queued;
}

export function createMediaCacheProcessor(dependencies: {
  readonly database: DatabaseClient;
  readonly logger: MediaCacheLogger;
  readonly mediaClient: HardenedMediaClient;
  readonly now?: () => Date;
  readonly shutdownSignal: AbortSignal;
  readonly storage: StorageAdapter;
}) {
  return async (job: Job<MediaCacheJobData>) => {
    const data = assertMediaCacheJobData(job.data);
    const now = dependencies.now ?? (() => new Date());
    const claim = await claimMedia(
      dependencies.database,
      dependencies.storage,
      data.mediaId,
      now(),
    );
    if (!claim) return Object.freeze({ coalesced: true });
    let prepared: PreparedStorageWrite | undefined;
    let committedKey: string | undefined;
    try {
      const key = createStorageKey();
      const result = await dependencies.mediaClient.download(
        {
          maxBytes: claim.configuration.maxObjectBytes,
          signal: dependencies.shutdownSignal,
          url: claim.remoteUrl,
        },
        async (response) => {
          const verifier = new MediaStreamVerifier({
            declaredMimeType: response.declaredMimeType,
            expectedKind: claim.kind,
          });
          prepared = await dependencies.storage.prepareWrite(
            key,
            verifier.verify(response.body),
            claim.configuration.maxObjectBytes,
          );
          const verified = verifier.result();
          if (
            prepared.byteLength !== verified.byteLength ||
            prepared.etag !== verified.sha256
          ) {
            throw new MediaCacheError("MEDIA_STORAGE_FAILED");
          }
          return verified;
        },
      );
      if (!prepared) throw new MediaCacheError("MEDIA_STORAGE_FAILED");
      const stored = await prepared.commit();
      committedKey = stored.key;
      const cachedAt = now();
      const expiresAt =
        claim.configuration.policy === "TTL"
          ? new Date(
              cachedAt.valueOf() + claim.configuration.ttlSeconds * 1_000,
            )
          : null;
      const updated = await dependencies.database.$transaction(
        async (transaction) => {
          await acquireQuotaLock(transaction);
          return transaction.mediaAsset.updateMany({
            data: {
              byteLength: BigInt(result.byteLength),
              cachedAt,
              cacheErrorCode: null,
              cacheExpiresAt: expiresAt,
              cachePolicy: claim.configuration.policy,
              cacheState: "CACHED",
              lastAccessedAt: cachedAt,
              mimeType: result.mimeType,
              sha256: result.sha256,
              storageKey: stored.key,
            },
            where: { cacheState: "FETCHING", id: data.mediaId },
          });
        },
      );
      if (updated.count === 0) {
        await dependencies.storage.delete(stored.key);
        return Object.freeze({ coalesced: true });
      }
      dependencies.logger.info("worker.media_cache.cached", {
        bytes: result.byteLength,
        mediaId: data.mediaId,
      });
      return Object.freeze({
        byteLength: result.byteLength,
        mediaId: data.mediaId,
        sha256: result.sha256,
      });
    } catch (error) {
      await prepared?.abort().catch(() => undefined);
      if (committedKey) {
        await dependencies.storage.delete(committedKey).catch(() => undefined);
      }
      const failure = safeCacheFailure(error);
      await dependencies.database.mediaAsset.updateMany({
        data: {
          cacheErrorCode: failure.code,
          cacheState: failure.blocked ? "BLOCKED" : "FAILED",
          storageKey: null,
        },
        where: { cacheState: "FETCHING", id: data.mediaId },
      });
      dependencies.logger.warn("worker.media_cache.failed", {
        code: failure.code,
        mediaId: data.mediaId,
      });
      if (failure.retryable) throw error;
      throw new UnrecoverableError(failure.code);
    }
  };
}

export async function evictMediaCache(
  database: DatabaseClient,
  storage: StorageAdapter,
  input: { readonly mode: "POLICY" | "PURGE"; readonly now: Date },
): Promise<{ readonly bytesEvicted: number; readonly objectsEvicted: number }> {
  const result = await database.$transaction(async (transaction) => {
    await acquireQuotaLock(transaction);
    const configuration = await readCacheConfiguration(transaction);
    const assets = await transaction.mediaAsset.findMany({
      orderBy: [{ lastAccessedAt: "asc" }, { cachedAt: "asc" }, { id: "asc" }],
      select: {
        byteLength: true,
        cacheExpiresAt: true,
        cachedAt: true,
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
        lastAccessedAt: true,
        storageKey: true,
      },
      take: 1_000,
      where: { cacheState: "CACHED", storageKey: { not: null } },
    });
    const rows = assets.map((asset) => ({
      cacheExpiresAt: asset.cacheExpiresAt,
      cachedAt: asset.cachedAt,
      favorite: asset.contentItem.actions.length > 0,
      id: asset.id,
      lastAccessedAt: asset.lastAccessedAt,
      size: Number(asset.byteLength ?? 0n),
    }));
    const forcedIds = new Set(
      assets
        .filter(
          (asset) =>
            input.mode === "PURGE" ||
            configuration.policy === "NONE" ||
            (configuration.policy === "FAVORITES_ONLY" &&
              asset.contentItem.actions.length === 0) ||
            (configuration.policy === "TTL" &&
              asset.cacheExpiresAt !== null &&
              asset.cacheExpiresAt <= input.now),
        )
        .map((asset) => asset.id),
    );
    const retainedBytes = rows
      .filter((row) => !forcedIds.has(row.id))
      .reduce((sum, row) => sum + row.size, 0);
    const quotaEvictions = selectEvictions(
      rows.filter((row) => !forcedIds.has(row.id)),
      {
        bytesNeeded: Math.max(0, retainedBytes - configuration.quotaBytes),
        now: input.now,
        policy: configuration.policy,
      },
    );
    for (const row of quotaEvictions) forcedIds.add(row.id);
    const selected = assets.filter((asset) => forcedIds.has(asset.id));
    if (selected.length > 0) {
      await transaction.mediaAsset.updateMany({
        data: {
          cacheErrorCode: null,
          cachedAt: null,
          cacheExpiresAt: null,
          cacheState: "EVICTED",
          lastAccessedAt: null,
          storageKey: null,
        },
        where: { id: { in: selected.map((asset) => asset.id) } },
      });
    }
    return selected.map((asset) => ({
      byteLength: Number(asset.byteLength ?? 0n),
      storageKey: asset.storageKey,
    }));
  });
  for (const object of result) {
    if (object.storageKey) await storage.delete(object.storageKey);
  }
  return Object.freeze({
    bytesEvicted: result.reduce((sum, object) => sum + object.byteLength, 0),
    objectsEvicted: result.length,
  });
}

export async function purgeOrphanedObjects(
  database: DatabaseClient,
  storage: StorageAdapter,
  limit = 1_000,
): Promise<number> {
  const objects = await storage.listByPrefix("objects", limit);
  if (objects.length === 0) return 0;
  const retained = await database.mediaAsset.findMany({
    select: { storageKey: true },
    where: { storageKey: { in: objects.map((object) => object.key) } },
  });
  const keys = new Set(
    retained.flatMap((row) => (row.storageKey ? [row.storageKey] : [])),
  );
  let removed = 0;
  for (const object of objects) {
    if (keys.has(object.key)) continue;
    await storage.delete(object.key);
    removed += 1;
  }
  return removed;
}

async function claimMedia(
  database: DatabaseClient,
  storage: StorageAdapter,
  mediaId: string,
  now: Date,
) {
  const result = await database.$transaction(async (transaction) => {
    await acquireQuotaLock(transaction);
    const configuration = await readCacheConfiguration(transaction);
    const asset = await transaction.mediaAsset.findUnique({
      select: {
        cacheState: true,
        contentItem: {
          select: {
            actions: {
              select: { id: true },
              take: 1,
              where: { kind: "FAVORITE" },
            },
            status: true,
          },
        },
        id: true,
        kind: true,
        remoteUrl: true,
      },
      where: { id: mediaId },
    });
    if (
      !asset ||
      asset.cacheState !== "QUEUED" ||
      asset.contentItem.status !== "ACTIVE" ||
      asset.kind === "LINK" ||
      !shouldCacheMedia({
        favorite: asset.contentItem.actions.length > 0,
        kind: asset.kind,
        policy: configuration,
      })
    ) {
      return null;
    }
    const [cached, fetching, candidates] = await Promise.all([
      transaction.mediaAsset.aggregate({
        _sum: { byteLength: true },
        where: { cacheState: "CACHED" },
      }),
      transaction.mediaAsset.count({ where: { cacheState: "FETCHING" } }),
      transaction.mediaAsset.findMany({
        orderBy: [
          { cacheExpiresAt: "asc" },
          { lastAccessedAt: "asc" },
          { cachedAt: "asc" },
          { id: "asc" },
        ],
        select: {
          byteLength: true,
          cacheExpiresAt: true,
          cachedAt: true,
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
          lastAccessedAt: true,
          storageKey: true,
        },
        take: 500,
        where: { cacheState: "CACHED", storageKey: { not: null } },
      }),
    ]);
    const usedBytes = Number(cached._sum.byteLength ?? 0n);
    const reservedBytes = (fetching + 1) * configuration.maxObjectBytes;
    const bytesNeeded = Math.max(
      0,
      usedBytes + reservedBytes - configuration.quotaBytes,
    );
    const evictions = selectEvictions(
      candidates.map((candidate) => ({
        cacheExpiresAt: candidate.cacheExpiresAt,
        cachedAt: candidate.cachedAt,
        favorite: candidate.contentItem.actions.length > 0,
        id: candidate.id,
        lastAccessedAt: candidate.lastAccessedAt,
        size: Number(candidate.byteLength ?? 0n),
      })),
      { bytesNeeded, now, policy: configuration.policy },
    );
    if (bytesNeeded > 0 && evictions.length === 0) {
      throw new MediaCacheError("MEDIA_QUOTA_EXCEEDED");
    }
    const evictedIds = new Set(evictions.map((candidate) => candidate.id));
    const evictedObjects = candidates
      .filter((candidate) => evictedIds.has(candidate.id))
      .flatMap((candidate) =>
        candidate.storageKey ? [candidate.storageKey] : [],
      );
    if (evictedIds.size > 0) {
      await transaction.mediaAsset.updateMany({
        data: {
          cachedAt: null,
          cacheExpiresAt: null,
          cacheState: "EVICTED",
          lastAccessedAt: null,
          storageKey: null,
        },
        where: { id: { in: [...evictedIds] } },
      });
    }
    const claimed = await transaction.mediaAsset.updateMany({
      data: {
        cacheErrorCode: null,
        cachePolicy: configuration.policy,
        cacheState: "FETCHING",
      },
      where: { cacheState: "QUEUED", id: mediaId },
    });
    return claimed.count === 0
      ? null
      : Object.freeze({
          configuration,
          evictedObjects,
          kind: asset.kind as "ANIMATED_IMAGE" | "IMAGE" | "VIDEO",
          remoteUrl: asset.remoteUrl,
        });
  });
  if (!result) return null;
  for (const key of result.evictedObjects) {
    await storage.delete(key).catch(() => undefined);
  }
  return result;
}

async function acquireQuotaLock(transaction: {
  $queryRaw: (
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
}): Promise<void> {
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(${quotaLockId})::text`;
}

function safeCacheFailure(error: unknown): {
  readonly blocked: boolean;
  readonly code: string;
  readonly retryable: boolean;
} {
  if (error instanceof MediaCacheError) {
    return Object.freeze({
      blocked: [
        "MEDIA_ACTIVE_CONTENT",
        "MEDIA_ADDRESS_REJECTED",
        "MEDIA_CONTENT_TYPE_MISMATCH",
        "MEDIA_CONTENT_TYPE_UNSUPPORTED",
        "MEDIA_RESPONSE_TOO_LARGE",
        "MEDIA_URL_REJECTED",
      ].includes(error.code),
      code: error.code,
      retryable: error.retryable,
    });
  }
  return Object.freeze({
    blocked: false,
    code: "MEDIA_CACHE_FAILED",
    retryable: true,
  });
}
