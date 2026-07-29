import "server-only";

import { loadServerConfig } from "../../../../packages/config/dist/server.js";
import { PostgresHealthProbe } from "../../../../packages/db/dist/index.js";
import { RedisHealthProbe } from "../../../../packages/redis/dist/index.js";
import type { DependencyHealth } from "../../../../packages/shared/dist/index.js";
import { LocalFilesystemStorage } from "../../../../packages/storage/dist/index.js";

interface RequiredProbes {
  readonly postgres: PostgresHealthProbe;
  readonly redis: RedisHealthProbe;
  readonly storage: LocalFilesystemStorage;
}

let probes: RequiredProbes | undefined;
let recentCheck:
  | {
      readonly expiresAt: number;
      readonly promise: Promise<readonly DependencyHealth[]>;
    }
  | undefined;
const READINESS_COALESCE_MS = 1_500;

function getProbes(): RequiredProbes {
  if (probes) {
    return probes;
  }

  const config = loadServerConfig();
  probes = Object.freeze({
    postgres: new PostgresHealthProbe({
      connectionString: config.databaseUrl,
      timeoutMs: config.healthCheckTimeoutMs,
    }),
    redis: new RedisHealthProbe({
      timeoutMs: config.healthCheckTimeoutMs,
      url: config.redisUrl,
    }),
    storage: new LocalFilesystemStorage(config.mediaStoragePath, {
      readOnly: true,
    }),
  });
  return probes;
}

export async function checkRequiredDependencies(): Promise<
  readonly DependencyHealth[]
> {
  const now = Date.now();
  if (recentCheck && recentCheck.expiresAt > now) return recentCheck.promise;
  const promise = performDependencyCheck();
  recentCheck = Object.freeze({
    expiresAt: now + READINESS_COALESCE_MS,
    promise,
  });
  return promise;
}

async function performDependencyCheck(): Promise<readonly DependencyHealth[]> {
  const required = getProbes();
  const [postgres, redis, storageReady] = await Promise.all([
    required.postgres.check(),
    required.redis.check(),
    required.storage.health(),
  ]);
  return Object.freeze([
    postgres,
    redis,
    Object.freeze({
      code: storageReady ? null : "DEPENDENCY_UNAVAILABLE",
      ready: storageReady,
    }),
  ]);
}
