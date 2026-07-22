import "server-only";

import { loadServerConfig } from "@mirthspool/config/server";
import {
  createCacheMaintenanceQueue,
  RedisFixedWindowStore,
} from "../../../../../packages/redis/dist/index";
import { LocalFilesystemStorage } from "../../../../../packages/storage/dist/index";

import { getAuthServices } from "../auth/server";

let services:
  | Readonly<{
      database: ReturnType<typeof getAuthServices>["database"];
      maintenanceQueue: ReturnType<typeof createCacheMaintenanceQueue>;
      mutationRateLimitStore: RedisFixedWindowStore;
      servingRateLimitStore: RedisFixedWindowStore;
      storage: LocalFilesystemStorage;
    }>
  | undefined;

export function getCacheServices() {
  if (services) return services;
  const config = loadServerConfig();
  services = Object.freeze({
    database: getAuthServices().database,
    maintenanceQueue: createCacheMaintenanceQueue(config.redisUrl),
    mutationRateLimitStore: new RedisFixedWindowStore({
      connectTimeoutMs: Math.min(config.healthCheckTimeoutMs, 1_000),
      prefix: "mirthspool:cache-mutation-rate-limit:",
      url: config.redisUrl,
    }),
    servingRateLimitStore: new RedisFixedWindowStore({
      connectTimeoutMs: Math.min(config.healthCheckTimeoutMs, 1_000),
      prefix: "mirthspool:media-serving-rate-limit:",
      url: config.redisUrl,
    }),
    storage: new LocalFilesystemStorage(config.mediaStoragePath, {
      readOnly: true,
    }),
  });
  return services;
}
