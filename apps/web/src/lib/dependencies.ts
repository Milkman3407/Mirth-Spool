import "server-only";

import { loadServerConfig } from "../../../../packages/config/dist/server.js";
import { PostgresHealthProbe } from "../../../../packages/db/dist/index.js";
import { RedisHealthProbe } from "../../../../packages/redis/dist/index.js";
import type { DependencyHealth } from "../../../../packages/shared/dist/index.js";

interface RequiredProbes {
  readonly postgres: PostgresHealthProbe;
  readonly redis: RedisHealthProbe;
}

let probes: RequiredProbes | undefined;

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
  });
  return probes;
}

export async function checkRequiredDependencies(): Promise<
  readonly DependencyHealth[]
> {
  const required = getProbes();
  return Promise.all([required.postgres.check(), required.redis.check()]);
}
