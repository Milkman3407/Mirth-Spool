import { Queue, type JobsOptions, type RedisOptions } from "bullmq";

export const QUEUE_NAMES = Object.freeze({
  duplicateDetection: "mirthspool-duplicate-detection",
  maintenance: "mirthspool-maintenance",
  mediaProcessing: "mirthspool-media-processing",
  sourcePolling: "mirthspool-source-polling",
});

export type SourcePollTrigger = "MANUAL" | "RETRY" | "SCHEDULED";

export interface SourcePollJobData {
  readonly correlationId?: string;
  readonly requestedAt: string;
  readonly sourceId: string;
  readonly trigger: SourcePollTrigger;
}

export interface SourcePollEnqueuer {
  add(
    name: "poll",
    data: SourcePollJobData,
    options: JobsOptions,
  ): Promise<{ readonly id?: string }>;
}

export interface MediaCacheJobData {
  readonly mediaId: string;
  readonly requestedAt: string;
}

export interface DuplicateDetectionJobData {
  readonly contentId: string;
  readonly requestedAt: string;
}

export interface DuplicateDetectionEnqueuer {
  add(
    name: "analyze",
    data: DuplicateDetectionJobData,
    options: JobsOptions,
  ): Promise<{ readonly id?: string }>;
}

export interface MediaCacheEnqueuer {
  add(
    name: "cache",
    data: MediaCacheJobData,
    options: JobsOptions,
  ): Promise<{ readonly id?: string }>;
}

export interface CacheMaintenanceJobData {
  readonly action: "EVICT" | "PURGE";
  readonly requestedAt: string;
}

export function assertCacheMaintenanceJobData(
  input: unknown,
): CacheMaintenanceJobData {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError("Invalid cache maintenance job.");
  }
  const value = input as Record<string, unknown>;
  if (
    !["EVICT", "PURGE"].includes(String(value.action)) ||
    typeof value.requestedAt !== "string" ||
    !Number.isFinite(Date.parse(value.requestedAt))
  ) {
    throw new TypeError("Invalid cache maintenance job.");
  }
  return Object.freeze({
    action: value.action as "EVICT" | "PURGE",
    requestedAt: value.requestedAt,
  });
}

export function bullConnectionFromUrl(redisUrl: string): RedisOptions {
  const url = new URL(redisUrl);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new TypeError("Redis URL must use redis or rediss.");
  }
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  if (!Number.isInteger(database) || database < 0) {
    throw new TypeError("Redis URL database must be a non-negative integer.");
  }
  return {
    db: database,
    host: url.hostname,
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    port: url.port ? Number(url.port) : 6_379,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
  };
}

export function createSourcePollQueue(
  redisUrl: string,
  retention: {
    readonly completedSeconds?: number;
    readonly failedSeconds?: number;
  } = {},
): Queue<SourcePollJobData> {
  return new Queue<SourcePollJobData>(QUEUE_NAMES.sourcePolling, {
    connection: bullConnectionFromUrl(redisUrl),
    defaultJobOptions: {
      attempts: 5,
      backoff: { delay: 5_000, type: "source-exponential" },
      removeOnComplete: {
        age: retention.completedSeconds ?? 3_600,
        count: 1_000,
      },
      removeOnFail: { age: retention.failedSeconds ?? 604_800, count: 5_000 },
    },
  });
}

export function createMediaCacheQueue(
  redisUrl: string,
  retention: {
    readonly completedSeconds?: number;
    readonly failedSeconds?: number;
  } = {},
): Queue<MediaCacheJobData> {
  return new Queue<MediaCacheJobData>(QUEUE_NAMES.mediaProcessing, {
    connection: bullConnectionFromUrl(redisUrl),
    defaultJobOptions: {
      attempts: 3,
      backoff: { delay: 10_000, type: "exponential" },
      removeOnComplete: {
        age: retention.completedSeconds ?? 3_600,
        count: 1_000,
      },
      removeOnFail: { age: retention.failedSeconds ?? 604_800, count: 2_000 },
    },
  });
}

export function createDuplicateDetectionQueue(
  redisUrl: string,
  retention: {
    readonly completedSeconds?: number;
    readonly failedSeconds?: number;
  } = {},
): Queue<DuplicateDetectionJobData> {
  return new Queue<DuplicateDetectionJobData>(QUEUE_NAMES.duplicateDetection, {
    connection: bullConnectionFromUrl(redisUrl),
    defaultJobOptions: {
      attempts: 3,
      backoff: { delay: 5_000, type: "exponential" },
      removeOnComplete: {
        age: retention.completedSeconds ?? 3_600,
        count: 2_000,
      },
      removeOnFail: { age: retention.failedSeconds ?? 604_800, count: 5_000 },
    },
  });
}

export function createCacheMaintenanceQueue(
  redisUrl: string,
): Queue<CacheMaintenanceJobData> {
  return new Queue<CacheMaintenanceJobData>(QUEUE_NAMES.maintenance, {
    connection: bullConnectionFromUrl(redisUrl),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 3_600, count: 100 },
      removeOnFail: { age: 604_800, count: 100 },
    },
  });
}

export function assertMediaCacheJobData(input: unknown): MediaCacheJobData {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError("Invalid media cache job.");
  }
  const value = input as Record<string, unknown>;
  if (
    typeof value.mediaId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value.mediaId,
    ) ||
    typeof value.requestedAt !== "string" ||
    !Number.isFinite(Date.parse(value.requestedAt))
  ) {
    throw new TypeError("Invalid media cache job.");
  }
  return Object.freeze({
    mediaId: value.mediaId,
    requestedAt: value.requestedAt,
  });
}

export function assertDuplicateDetectionJobData(
  input: unknown,
): DuplicateDetectionJobData {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError("Invalid duplicate detection job.");
  }
  const value = input as Record<string, unknown>;
  if (
    typeof value.contentId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value.contentId,
    ) ||
    typeof value.requestedAt !== "string" ||
    !Number.isFinite(Date.parse(value.requestedAt))
  ) {
    throw new TypeError("Invalid duplicate detection job.");
  }
  return Object.freeze({
    contentId: value.contentId,
    requestedAt: value.requestedAt,
  });
}

export async function enqueueDuplicateDetection(
  queue: DuplicateDetectionEnqueuer,
  data: DuplicateDetectionJobData,
): Promise<{ readonly id: string }> {
  const validated = assertDuplicateDetectionJobData(data);
  const jobId = `duplicate-${validated.contentId}-${Date.parse(
    validated.requestedAt,
  )}`;
  const job = await queue.add("analyze", validated, { jobId });
  return Object.freeze({ id: job.id ?? jobId });
}

export async function enqueueMediaCache(
  queue: MediaCacheEnqueuer,
  data: MediaCacheJobData,
): Promise<{ readonly id: string }> {
  const validated = assertMediaCacheJobData(data);
  const jobId = `cache-${validated.mediaId}-${Date.parse(validated.requestedAt)}`;
  const job = await queue.add("cache", validated, { jobId });
  return Object.freeze({ id: job.id ?? jobId });
}

export function sourcePollJobId(data: SourcePollJobData): string {
  const instant = Date.parse(data.requestedAt);
  if (!Number.isFinite(instant))
    throw new TypeError("requestedAt must be an ISO instant.");
  const bucketMilliseconds = data.trigger === "MANUAL" ? 30_000 : 60_000;
  return `poll-${data.sourceId}-${data.trigger.toLowerCase()}-${Math.floor(instant / bucketMilliseconds)}`;
}

export function assertSourcePollJobData(input: unknown): SourcePollJobData {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError("Invalid source poll job.");
  }
  const value = input as Record<string, unknown>;
  if (
    typeof value.sourceId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value.sourceId,
    ) ||
    typeof value.requestedAt !== "string" ||
    !Number.isFinite(Date.parse(value.requestedAt)) ||
    !["MANUAL", "RETRY", "SCHEDULED"].includes(String(value.trigger))
  ) {
    throw new TypeError("Invalid source poll job.");
  }
  return Object.freeze({
    ...(typeof value.correlationId === "string" &&
    /^req_[0-9a-f-]{36}$/u.test(value.correlationId)
      ? { correlationId: value.correlationId }
      : {}),
    requestedAt: value.requestedAt,
    sourceId: value.sourceId,
    trigger: value.trigger as SourcePollTrigger,
  });
}

export async function enqueueSourcePoll(
  queue: SourcePollEnqueuer,
  data: SourcePollJobData,
): Promise<{ readonly id: string }> {
  const validated = assertSourcePollJobData(data);
  const jobId = sourcePollJobId(validated);
  const job = await queue.add("poll", validated, { jobId });
  return Object.freeze({ id: job.id ?? jobId });
}
