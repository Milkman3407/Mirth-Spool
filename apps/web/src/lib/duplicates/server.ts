import "server-only";

import { loadServerConfig } from "@mirthspool/config/server";
import { RedisFixedWindowStore } from "../../../../../packages/redis/dist/index";

import { getAuthServices } from "../auth/server";

let services:
  | Readonly<{
      database: ReturnType<typeof getAuthServices>["database"];
      mutationRateLimitStore: RedisFixedWindowStore;
      secret: string;
    }>
  | undefined;

export function getDuplicateServices() {
  if (services) return services;
  const auth = getAuthServices();
  const config = loadServerConfig();
  services = Object.freeze({
    database: auth.database,
    mutationRateLimitStore: new RedisFixedWindowStore({
      connectTimeoutMs: Math.min(config.healthCheckTimeoutMs, 1_000),
      prefix: "mirthspool:duplicate-mutation-rate-limit:",
      url: config.redisUrl,
    }),
    secret: auth.authConfig.secret,
  });
  return services;
}
