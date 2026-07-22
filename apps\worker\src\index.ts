import console from "node:console";
import { rm, writeFile } from "node:fs/promises";
import process from "node:process";

import {
  ConnectorRegistry,
  HardenedHttpClient,
  rssConnector,
} from "@mirthspool/connectors";
import { loadServerConfig } from "@mirthspool/config/server";
import { loadSourceSecurityConfig } from "@mirthspool/config/source-security";
import {
  cleanupIngestionRuns,
  createDatabaseClient,
  PostgresHealthProbe,
} from "@mirthspool/db";
import {
  bullConnectionFromUrl,
  createSourcePollQueue,
  QUEUE_NAMES,
  RedisHealthProbe,
  type SourcePollJobData,
} from "@mirthspool/redis";
import { createStructuredLogger } from "@mirthspool/shared";
import { Queue, Worker } from "bullmq";

import {
  createCredentialKeyring,
  createSourcePollProcessor,
  sourceBackoffStrategy,
} from "./processor.js";
import { scheduleDueSources } from "./scheduler.js";

const heartbeatPath = "/tmp/mirthspool-worker-heartbeat";
const dayMilliseconds = 86_400_000;

async function main(): Promise<void> {
  const config = loadServerConfig();
  const security = loadSourceSecurityConfig();
  const logger = createStructuredLogger({
    environment: config.nodeEnvironment,
    minimumLevel: config.logLevel,
    service: "worker",
    sink: (line) => console.log(line),
  });
  const dependencyHealth = await Promise.all([
    new PostgresHealthProbe({
      connectionString: config.databaseUrl,
      timeoutMs: config.healthCheckTimeoutMs,
    }).check(),
    new RedisHealthProbe({
      timeoutMs: config.healthCheckTimeoutMs,
      url: config.redisUrl,
    }).check(),
  ]);
  if (dependencyHealth.some((dependency) => !dependency.ready)) {
    logger.error("worker.startup.dependencies_unavailable", {
      code: "DEPENDENCY_UNAVAILABLE",
    });
    process.exitCode = 1;
    return;
  }

  const database = createDatabaseClient({
    connectionString: config.databaseUrl,
  });
  const connection = bullConnectionFromUrl(config.redisUrl);
  const sourceQueue = createSourcePollQueue(config.redisUrl, {
    completedSeconds: config.completedJobRetentionSeconds,
    failedSeconds: config.failedJobRetentionSeconds,
  });
  const maintenanceQueue = new Queue(QUEUE_NAMES.maintenance, { connection });
  const shutdownController = new AbortController();
  const sourceWorker = new Worker<SourcePollJobData>(
    QUEUE_NAMES.sourcePolling,
    createSourcePollProcessor({
      database,
      http: new HardenedHttpClient({
        allowPrivateAddresses: security.allowPrivateSourceUrls,
        allowedPorts: security.allowedSourcePorts,
        logger,
      }),
      keyring: createCredentialKeyring(
        security.encryptionKeyVersion,
        security.encryptionKey,
      ),
      limits: {
        maxBytes: 10_000_000,
        maxDurationMs: config.ingestionMaxDurationMs,
        maxItems: 100,
        maxPages: 10,
        maxRequests: 12,
      },
      logger,
      registry: new ConnectorRegistry([rssConnector]),
      shutdownSignal: shutdownController.signal,
    }),
    {
      concurrency: 4,
      connection,
      settings: { backoffStrategy: sourceBackoffStrategy },
    },
  );
  const maintenanceWorker = new Worker(
    QUEUE_NAMES.maintenance,
    async () => {
      const olderThan = new Date(
        Date.now() - config.ingestionRunRetentionDays * dayMilliseconds,
      );
      const result = await cleanupIngestionRuns(database, olderThan);
      return { deletedRuns: result.count };
    },
    { concurrency: 1, connection },
  );

  sourceWorker.on("failed", (job, error) => {
    logger.warn("worker.source_poll.failed", {
      code: error.message.slice(0, 100),
      jobId: job?.id,
    });
  });
  sourceWorker.on("error", () =>
    logger.error("worker.source_poll.error", { code: "QUEUE_ERROR" }),
  );
  maintenanceWorker.on("error", () =>
    logger.error("worker.maintenance.error", { code: "QUEUE_ERROR" }),
  );

  const heartbeat = async (): Promise<void> => {
    await writeFile(heartbeatPath, new Date().toISOString(), {
      encoding: "utf8",
      mode: 0o600,
    });
  };
  const schedule = async (): Promise<void> => {
    const count = await scheduleDueSources(database, sourceQueue, new Date());
    if (count > 0) logger.info("worker.scheduler.enqueued", { count });
  };
  const enqueueMaintenance = async (): Promise<void> => {
    const day = new Date().toISOString().slice(0, 10);
    await maintenanceQueue.add(
      "cleanup",
      {},
      {
        jobId: `maintenance-${day}`,
        removeOnComplete: {
          age: config.completedJobRetentionSeconds,
          count: 30,
        },
        removeOnFail: { age: config.failedJobRetentionSeconds, count: 100 },
      },
    );
  };

  await Promise.all([heartbeat(), schedule(), enqueueMaintenance()]);
  logger.info("worker.ready", { dependencies: 2, ingestionEnabled: true });
  const heartbeatTimer = setInterval(
    () =>
      void heartbeat().catch(() =>
        logger.error("worker.heartbeat.failed", {
          code: "HEARTBEAT_WRITE_FAILED",
        }),
      ),
    config.workerHeartbeatIntervalMs,
  );
  const schedulerTimer = setInterval(
    () =>
      void schedule().catch(() =>
        logger.error("worker.scheduler.failed", { code: "SCHEDULER_FAILED" }),
      ),
    config.schedulerIntervalMs,
  );
  const maintenanceTimer = setInterval(
    () =>
      void enqueueMaintenance().catch(() =>
        logger.error("worker.maintenance.enqueue_failed", {
          code: "MAINTENANCE_ENQUEUE_FAILED",
        }),
      ),
    3_600_000,
  );

  let shuttingDown = false;
  const shutdown = async (signal: "SIGINT" | "SIGTERM"): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(heartbeatTimer);
    clearInterval(schedulerTimer);
    clearInterval(maintenanceTimer);
    logger.info("worker.shutdown.started", { signal });
    shutdownController.abort(signal);
    await Promise.all([sourceWorker.close(), maintenanceWorker.close()]);
    await Promise.all([sourceQueue.close(), maintenanceQueue.close()]);
    await database.$disconnect();
    await rm(heartbeatPath, { force: true });
    logger.info("worker.shutdown.complete", { signal });
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

await main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      service: "worker",
      environment: "unknown",
      event: "worker.startup.failed",
      errorType: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  process.exitCode = 1;
});
