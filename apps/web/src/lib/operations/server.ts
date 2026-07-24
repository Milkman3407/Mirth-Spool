import "server-only";

import { loadServerConfig } from "../../../../../packages/config/dist/server";
import {
  getCacheSummary,
  getDatabaseClient,
  readIngestionOperationalMetrics,
} from "../../../../../packages/db/dist/index";
import {
  createDuplicateDetectionQueue,
  createMediaCacheQueue,
  createSourcePollQueue,
} from "../../../../../packages/redis/dist/index";
import { LocalFilesystemStorage } from "../../../../../packages/storage/dist/index";

export async function readOperationalSnapshot() {
  const config = loadServerConfig();
  const database = getDatabaseClient({ connectionString: config.databaseUrl });
  const queues = [
    ["source", createSourcePollQueue(config.redisUrl)],
    ["media", createMediaCacheQueue(config.redisUrl)],
    ["duplicate", createDuplicateDetectionQueue(config.redisUrl)],
  ] as const;
  try {
    const [
      runs,
      sources,
      cache,
      queueCounts,
      databaseProbe,
      storageReady,
      recommendationProfiles,
      staleRecommendationProfiles,
      truncatedRecommendationProfiles,
    ] = await Promise.all([
      readIngestionOperationalMetrics(
        database,
        new Date(Date.now() - 86_400_000),
      ),
      database.source.aggregate({
        _count: { _all: true },
        _sum: { consecutiveFailures: true },
        where: { deletedAt: null },
      }),
      getCacheSummary(database),
      Promise.all(
        queues.map(async ([name, queue]) => ({
          name,
          counts: await queue.getJobCounts(
            "active",
            "completed",
            "delayed",
            "failed",
            "waiting",
          ),
        })),
      ),
      database.$queryRaw`SELECT 1`,
      new LocalFilesystemStorage(config.mediaStoragePath, {
        readOnly: true,
      }).health(),
      database.recommendationProfile.count(),
      database.recommendationProfile.count({
        where: {
          computedAt: { lt: new Date(Date.now() - 25 * 60 * 60 * 1_000) },
        },
      }),
      database.recommendationProfile.count({ where: { truncated: true } }),
    ]);
    return Object.freeze({
      cache: { counts: cache.counts, usedBytes: cache.usedBytes },
      database: { ready: databaseProbe !== null },
      ingestion: runs,
      queues: queueCounts,
      recommendations: {
        profiles: recommendationProfiles,
        staleProfiles: staleRecommendationProfiles,
        truncatedProfiles: truncatedRecommendationProfiles,
      },
      sources: {
        active: sources._count._all,
        failures: sources._sum.consecutiveFailures ?? 0,
      },
      storage: { ready: storageReady },
      windowSeconds: 86_400,
    });
  } finally {
    await Promise.all(queues.map(([, queue]) => queue.close()));
  }
}
