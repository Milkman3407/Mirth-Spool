import {
  findDuplicateMatches,
  listDuplicateAnalysisCandidates,
  loadDuplicateAnalysisTarget,
  markDuplicateAnalyzed,
  mergeDuplicateItems,
  setMediaPerceptualHash,
  type DatabaseClient,
} from "@mirthspool/db";
import {
  assertDuplicateDetectionJobData,
  enqueueDuplicateDetection,
  type DuplicateDetectionEnqueuer,
  type DuplicateDetectionJobData,
} from "@mirthspool/redis";
import type {
  PerceptualHasher,
  PerceptualHashResult,
} from "@mirthspool/deduplication";
import type { StorageAdapter } from "@mirthspool/storage";
import type { Job } from "bullmq";

const safeRasterMimes = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface DuplicateAnalysisLimits {
  readonly hashMaxBytes: number;
  readonly hashMaxPixels: number;
  readonly hashTimeoutMs: number;
  readonly maxCandidates: number;
}

export interface DuplicateLogger {
  info(event: string, fields: Readonly<Record<string, unknown>>): void;
  warn(event: string, fields: Readonly<Record<string, unknown>>): void;
}

export async function scheduleDuplicateAnalysis(
  database: DatabaseClient,
  queue: DuplicateDetectionEnqueuer,
  limit = 100,
): Promise<number> {
  const candidates = await listDuplicateAnalysisCandidates(database, limit);
  let queued = 0;
  for (const candidate of candidates) {
    await enqueueDuplicateDetection(queue, {
      contentId: candidate.id,
      requestedAt: candidate.updatedAt.toISOString(),
    });
    queued += 1;
  }
  return queued;
}

export function createDuplicateDetectionProcessor(dependencies: {
  readonly database: DatabaseClient;
  readonly hasher: PerceptualHasher;
  readonly limits: DuplicateAnalysisLimits;
  readonly logger: DuplicateLogger;
  readonly now?: () => Date;
  readonly shutdownSignal: AbortSignal;
  readonly storage: StorageAdapter;
}) {
  return async (job: Job<DuplicateDetectionJobData>) => {
    const data = assertDuplicateDetectionJobData(job.data);
    const now = dependencies.now ?? (() => new Date());
    let target = await loadDuplicateAnalysisTarget(
      dependencies.database,
      data.contentId,
    );
    if (!target) return Object.freeze({ missing: true });
    const hashable = target.mediaAssets.find(
      (media) =>
        media.kind === "IMAGE" &&
        media.cacheState === "CACHED" &&
        media.storageKey &&
        media.mimeType &&
        safeRasterMimes.has(media.mimeType) &&
        !media.perceptualHash,
    );
    if (hashable?.storageKey) {
      const object = await dependencies.storage.open(hashable.storageKey);
      if (object) {
        const result = await safeHash(
          dependencies.hasher,
          {
            body: object.body,
            maxBytes: dependencies.limits.hashMaxBytes,
            maxPixels: dependencies.limits.hashMaxPixels,
            signal: dependencies.shutdownSignal,
            timeoutMs: dependencies.limits.hashTimeoutMs,
          },
          dependencies.logger,
          data.contentId,
        );
        if (result) {
          await setMediaPerceptualHash(dependencies.database, {
            ...result,
            mediaId: hashable.id,
          });
          target = await loadDuplicateAnalysisTarget(
            dependencies.database,
            data.contentId,
          );
        }
      }
    }
    const matches = await findDuplicateMatches(
      dependencies.database,
      data.contentId,
      dependencies.limits.maxCandidates,
    );
    for (const match of matches) {
      await mergeDuplicateItems(dependencies.database, {
        distance: match.distance,
        leftContentId: data.contentId,
        reason: match.reason,
        rightContentId: match.contentId,
      });
    }
    await markDuplicateAnalyzed(dependencies.database, data.contentId, now());
    dependencies.logger.info("worker.duplicate_analysis.complete", {
      contentId: data.contentId,
      matches: matches.length,
      perceptualHash: Boolean(
        target?.mediaAssets.some((media) => media.perceptualHash),
      ),
    });
    return Object.freeze({
      contentId: data.contentId,
      matches: matches.length,
    });
  };
}

async function safeHash(
  hasher: PerceptualHasher,
  input: Parameters<PerceptualHasher["hash"]>[0],
  logger: DuplicateLogger,
  contentId: string,
): Promise<PerceptualHashResult | null> {
  try {
    return await hasher.hash(input);
  } catch (error) {
    logger.warn("worker.duplicate_analysis.hash_rejected", {
      code:
        error instanceof Error
          ? error.message.slice(0, 100)
          : "HASH_DECODE_FAILED",
      contentId,
    });
    return null;
  }
}
