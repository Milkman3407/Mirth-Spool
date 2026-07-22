import "server-only";

import { loadAuthConfig } from "../../../../../packages/config/dist/auth";
import { loadServerConfig } from "../../../../../packages/config/dist/server";
import { getDatabaseClient } from "../../../../../packages/db/dist/index";
import { RedisFixedWindowStore } from "../../../../../packages/redis/dist/index";

import { createMirthSpoolAuth } from "./factory";

type AuthServices = Readonly<{
  auth: ReturnType<typeof createMirthSpoolAuth>;
  authConfig: ReturnType<typeof loadAuthConfig>;
  authenticationRateLimitStore: RedisFixedWindowStore;
  database: ReturnType<typeof getDatabaseClient>;
}>;

let services: AuthServices | undefined;

export function getAuthServices(): AuthServices {
  if (services) return services;
  const serverConfig = loadServerConfig();
  const authConfig = loadAuthConfig();
  const database = getDatabaseClient({
    connectionString: serverConfig.databaseUrl,
  });
  services = Object.freeze({
    auth: createMirthSpoolAuth({
      database,
      publicOrigin: authConfig.publicOrigin,
      secret: authConfig.secret,
      secureCookies: authConfig.secureCookies,
    }),
    authConfig,
    authenticationRateLimitStore: new RedisFixedWindowStore({
      connectTimeoutMs: Math.min(serverConfig.healthCheckTimeoutMs, 1_000),
      prefix: "mirthspool:auth-rate-limit:",
      url: serverConfig.redisUrl,
    }),
    database,
  });
  return services;
}
