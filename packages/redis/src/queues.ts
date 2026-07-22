import { Queue, type JobsOptions, type RedisOptions } from "bullmq";

export const QUEUE_NAMES = Object.freeze({
  duplicateDetection: "mirthspool-duplicate-detection",
  maintenance: "mirthspool-maintenance",
  mediaProcessing: "mirthspool-media-processing",
  sourcePolling: "mirthspool-source-polling",
});

export type SourcePollTrigger = "MANUAL" | "RETRY" | "SCHEDULED";

export interface SourcePollJobData {
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
