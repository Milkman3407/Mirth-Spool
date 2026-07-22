import process from "node:process";
import path from "node:path";
import { z } from "zod";

import { parseClientConfig, type ClientConfig } from "./client.js";

const serverEnvironmentSchema = z.object({
  DATABASE_URL: z
    .url("must be an absolute URL")
    .max(2_048, "must be at most 2048 characters")
    .refine(
      (value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol),
      {
        message: "must use postgres or postgresql",
      },
    ),
  MIRTHSPOOL_HEALTH_CHECK_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(5_000)
    .default(1_000),
  MIRTHSPOOL_COMPLETED_JOB_RETENTION_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(604_800)
    .default(3_600),
  MIRTHSPOOL_FAILED_JOB_RETENTION_SECONDS: z.coerce
    .number()
    .int()
    .min(3_600)
    .max(2_592_000)
    .default(604_800),
  MIRTHSPOOL_DUPLICATE_ANALYSIS_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1)
    .max(4)
    .default(1),
  MIRTHSPOOL_DUPLICATE_HASH_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(65_536)
    .max(50_000_000)
    .default(20_000_000),
  MIRTHSPOOL_DUPLICATE_HASH_MAX_PIXELS: z.coerce
    .number()
    .int()
    .min(65_536)
    .max(100_000_000)
    .default(16_777_216),
  MIRTHSPOOL_DUPLICATE_HASH_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(30_000)
    .default(5_000),
  MIRTHSPOOL_DUPLICATE_MAX_CANDIDATES: z.coerce
    .number()
    .int()
    .min(10)
    .max(500)
    .default(100),
  MIRTHSPOOL_INGESTION_MAX_DURATION_MS: z.coerce
    .number()
    .int()
    .min(5_000)
    .max(300_000)
    .default(60_000),
  MIRTHSPOOL_INGESTION_RUN_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(365)
    .default(30),
  MIRTHSPOOL_SCHEDULER_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(60_000)
    .default(15_000),
  MIRTHSPOOL_LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
  MIRTHSPOOL_MEDIA_CACHE_CONCURRENCY: z.coerce
    .number()
    .int()
    .min(1)
    .max(8)
    .default(2),
  MIRTHSPOOL_MEDIA_STORAGE_PATH: z
    .string()
    .min(1)
    .max(1_024)
    .default("/var/lib/mirthspool/media")
    .refine((value) => path.isAbsolute(value) && !value.includes("\0"), {
      message: "must be an absolute path",
    }),
  MIRTHSPOOL_PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  MIRTHSPOOL_PUBLIC_ORIGIN: z.string(),
  MIRTHSPOOL_WORKER_HEARTBEAT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(60_000)
    .default(10_000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  REDIS_URL: z
    .url("must be an absolute URL")
    .max(2_048, "must be at most 2048 characters")
    .refine(
      (value) => ["redis:", "rediss:"].includes(new URL(value).protocol),
      {
        message: "must use redis or rediss",
      },
    ),
});

export const CONFIGURATION_ERROR_CODE = "CONFIGURATION_INVALID" as const;

export class ConfigurationError extends Error {
  readonly code = CONFIGURATION_ERROR_CODE;
  readonly fields: readonly string[];

  constructor(fields: readonly string[]) {
    super(`Invalid server configuration: ${fields.join(", ")}`);
    this.name = "ConfigurationError";
    this.fields = Object.freeze([...fields]);
  }
}

export interface ServerConfig {
  readonly client: ClientConfig;
  readonly completedJobRetentionSeconds: number;
  readonly databaseUrl: string;
  readonly duplicateAnalysisConcurrency: number;
  readonly duplicateHashMaxBytes: number;
  readonly duplicateHashMaxPixels: number;
  readonly duplicateHashTimeoutMs: number;
  readonly duplicateMaxCandidates: number;
  readonly failedJobRetentionSeconds: number;
  readonly healthCheckTimeoutMs: number;
  readonly ingestionMaxDurationMs: number;
  readonly ingestionRunRetentionDays: number;
  readonly logLevel: "debug" | "info" | "warn" | "error";
  readonly mediaCacheConcurrency: number;
  readonly mediaStoragePath: string;
  readonly nodeEnvironment: "development" | "test" | "production";
  readonly port: number;
  readonly redisUrl: string;
  readonly schedulerIntervalMs: number;
  readonly workerHeartbeatIntervalMs: number;
}

export function parseServerConfig(environment: unknown): ServerConfig {
  const parsed = serverEnvironmentSchema.safeParse(environment);

  if (!parsed.success) {
    const fields = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ].sort();
    throw new ConfigurationError(fields);
  }

  try {
    return Object.freeze({
      client: parseClientConfig(parsed.data),
      completedJobRetentionSeconds:
        parsed.data.MIRTHSPOOL_COMPLETED_JOB_RETENTION_SECONDS,
      databaseUrl: parsed.data.DATABASE_URL,
      duplicateAnalysisConcurrency:
        parsed.data.MIRTHSPOOL_DUPLICATE_ANALYSIS_CONCURRENCY,
      duplicateHashMaxBytes: parsed.data.MIRTHSPOOL_DUPLICATE_HASH_MAX_BYTES,
      duplicateHashMaxPixels: parsed.data.MIRTHSPOOL_DUPLICATE_HASH_MAX_PIXELS,
      duplicateHashTimeoutMs: parsed.data.MIRTHSPOOL_DUPLICATE_HASH_TIMEOUT_MS,
      duplicateMaxCandidates: parsed.data.MIRTHSPOOL_DUPLICATE_MAX_CANDIDATES,
      failedJobRetentionSeconds:
        parsed.data.MIRTHSPOOL_FAILED_JOB_RETENTION_SECONDS,
      healthCheckTimeoutMs: parsed.data.MIRTHSPOOL_HEALTH_CHECK_TIMEOUT_MS,
      ingestionMaxDurationMs: parsed.data.MIRTHSPOOL_INGESTION_MAX_DURATION_MS,
      ingestionRunRetentionDays:
        parsed.data.MIRTHSPOOL_INGESTION_RUN_RETENTION_DAYS,
      logLevel: parsed.data.MIRTHSPOOL_LOG_LEVEL,
      mediaCacheConcurrency: parsed.data.MIRTHSPOOL_MEDIA_CACHE_CONCURRENCY,
      mediaStoragePath: path.resolve(parsed.data.MIRTHSPOOL_MEDIA_STORAGE_PATH),
      nodeEnvironment: parsed.data.NODE_ENV,
      port: parsed.data.MIRTHSPOOL_PORT,
      redisUrl: parsed.data.REDIS_URL,
      schedulerIntervalMs: parsed.data.MIRTHSPOOL_SCHEDULER_INTERVAL_MS,
      workerHeartbeatIntervalMs:
        parsed.data.MIRTHSPOOL_WORKER_HEARTBEAT_INTERVAL_MS,
    });
  } catch {
    throw new ConfigurationError(["MIRTHSPOOL_PUBLIC_ORIGIN"]);
  }
}

export function loadServerConfig(): ServerConfig {
  return parseServerConfig(process.env);
}
