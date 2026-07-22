import "server-only";

import console from "node:console";

import {
  ConnectorRegistry,
  HardenedHttpClient,
  rssConnector,
} from "../../../../../packages/connectors/dist/index";
import { loadServerConfig } from "../../../../../packages/config/dist/server";
import { loadSourceSecurityConfig } from "../../../../../packages/config/dist/source-security";
import { RedisFixedWindowStore } from "../../../../../packages/redis/dist/index";
import { createSourcePollQueue } from "../../../../../packages/redis/dist/queues";
import { createStructuredLogger } from "../../../../../packages/shared/dist/index";

import { getAuthServices } from "../auth/server";
import {
  sourceServiceKeyring,
  type SourceServiceDependencies,
} from "./source-service";

type SourceServices = Readonly<{
  readonly dependencies: SourceServiceDependencies;
  readonly refreshRateLimitStore: RedisFixedWindowStore;
  readonly sourcePollQueue: ReturnType<typeof createSourcePollQueue>;
  readonly validationRateLimitStore: RedisFixedWindowStore;
}>;

let services: SourceServices | undefined;

export function getSourceServices(): SourceServices {
  if (services) return services;
  const serverConfig = loadServerConfig();
  const security = loadSourceSecurityConfig();
  const logger = createStructuredLogger({
    environment: serverConfig.nodeEnvironment,
    minimumLevel: serverConfig.logLevel,
    service: "web",
    sink: (line) => console.log(line),
  });
  const registry = new ConnectorRegistry([rssConnector]);
  services = Object.freeze({
    dependencies: Object.freeze({
      database: getAuthServices().database,
      http: new HardenedHttpClient({
        allowPrivateAddresses: security.allowPrivateSourceUrls,
        allowedPorts: security.allowedSourcePorts,
        logger,
      }),
      keyring: sourceServiceKeyring(
        security.encryptionKeyVersion,
        security.encryptionKey,
      ),
      logger,
      registry,
    }),
    refreshRateLimitStore: new RedisFixedWindowStore({
      connectTimeoutMs: Math.min(serverConfig.healthCheckTimeoutMs, 1_000),
      prefix: "mirthspool:source-refresh-rate-limit:",
      url: serverConfig.redisUrl,
    }),
    sourcePollQueue: createSourcePollQueue(serverConfig.redisUrl, {
      completedSeconds: serverConfig.completedJobRetentionSeconds,
      failedSeconds: serverConfig.failedJobRetentionSeconds,
    }),
    validationRateLimitStore: new RedisFixedWindowStore({
      connectTimeoutMs: Math.min(serverConfig.healthCheckTimeoutMs, 1_000),
      prefix: "mirthspool:source-validation-rate-limit:",
      url: serverConfig.redisUrl,
    }),
  });
  return services;
}
