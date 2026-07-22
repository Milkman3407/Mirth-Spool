import { randomUUID } from "node:crypto";

import {
  ConnectorError,
  ConnectorRegistry,
  connectorPageSchema,
  defineConnector,
  type ConnectorHttpClient,
} from "@mirthspool/connectors";
import {
  claimIngestionRun,
  createDatabaseClient,
  listDueSources,
  persistIngestionPage,
  type DatabaseClient,
  type NormalizedContentInput,
} from "@mirthspool/db";
import { createSourcePollQueue } from "@mirthspool/redis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createCredentialKeyring,
  createSourcePollProcessor,
  RetryableIngestionError,
} from "../../apps/worker/src/processor.js";
import { scheduleDueSources } from "../../apps/worker/src/scheduler.js";

const now = new Date("2026-07-21T12:00:00.000Z");
const silentLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};
const unusedHttp: ConnectorHttpClient = {
  request: () => Promise.reject(new Error("unexpected HTTP request")),
};

describe.sequential("ingestion scheduling and persistence", () => {
  let database: DatabaseClient;

  beforeAll(async () => {
    database = createDatabaseClient({
      connectionString: process.env.DATABASE_URL!,
    });
    await database.ingestionRun.deleteMany();
    await database.sourceCheckpoint.deleteMany();
    await database.sourcePost.deleteMany();
    await database.mediaAsset.deleteMany();
    await database.contentItem.deleteMany();
    await database.source.deleteMany();
  });

  afterAll(async () => {
    await database.ingestionRun.deleteMany();
    await database.sourceCheckpoint.deleteMany();
    await database.sourcePost.deleteMany();
    await database.mediaAsset.deleteMany();
    await database.contentItem.deleteMany();
    await database.source.deleteMany();
    await database.$disconnect();
  });

  it("selects due sources and coalesces duplicate scheduler instances in BullMQ", async () => {
    const due = await createSource(database, {
      nextPollAt: new Date(now.valueOf() - 1_000),
    });
    await createSource(database, {
      nextPollAt: new Date(now.valueOf() + 60_000),
    });
    await createSource(database, { enabled: false, nextPollAt: null });
    expect(
      (await listDueSources(database, now)).map((source) => source.id),
    ).toEqual([due.id]);

    const queue = createSourcePollQueue(process.env.REDIS_URL!);
    await queue.drain(true);
    await Promise.all([
      scheduleDueSources(database, queue, now),
      scheduleDueSources(database, queue, now),
    ]);
    expect(await queue.getWaitingCount()).toBe(1);
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it("permits only one active run across manual and scheduled delivery", async () => {
    const source = await createSource(database);
    const inputs = ["manual-job", "scheduled-job"].map((jobId, index) =>
      claimIngestionRun(database, {
        attempt: 1,
        jobId,
        sourceId: source.id,
        staleBefore: new Date(now.valueOf() - 120_000),
        startedAt: new Date(now.valueOf() + index),
        trigger: index === 0 ? "MANUAL" : "SCHEDULED",
      }),
    );
    const claims = await Promise.all(inputs);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(
      await database.ingestionRun.count({
        where: { sourceId: source.id, status: "RUNNING" },
      }),
    ).toBe(1);
  });

  it("keeps idempotent content and checkpoints transaction-safe across redelivery", async () => {
    const source = await createSource(database);
    const item = normalizedItem(source.id);
    expect(
      await persistIngestionPage(
        database,
        {
          checkpoint: { etag: "v1" },
          items: [item],
          sourceId: source.id,
        },
        now,
      ),
    ).toMatchObject({ created: 1, updated: 0 });
    expect(
      await persistIngestionPage(
        database,
        {
          checkpoint: { etag: "v2" },
          items: [item],
          sourceId: source.id,
        },
        new Date(now.valueOf() + 1_000),
      ),
    ).toMatchObject({ created: 0, updated: 1 });
    expect(
      await database.sourcePost.count({ where: { sourceId: source.id } }),
    ).toBe(1);

    await expect(
      persistIngestionPage(
        database,
        {
          checkpoint: { etag: "must-not-commit" },
          items: [{ ...item, media: [item.media[0]!, item.media[0]!] }],
          sourceId: source.id,
        },
        new Date(now.valueOf() + 2_000),
      ),
    ).rejects.toThrow();
    expect(
      await database.sourceCheckpoint.findUniqueOrThrow({
        where: { sourceId_scope: { scope: "poll", sourceId: source.id } },
      }),
    ).toMatchObject({ valueJson: { etag: "v2" } });
    expect(
      await database.mediaAsset.count({
        where: {
          contentItem: { sourcePosts: { some: { sourceId: source.id } } },
        },
      }),
    ).toBe(1);
  });

  it.each([
    ["TRANSIENT", "DEGRADED", true],
    ["RATE_LIMITED", "DEGRADED", true],
    ["AUTHENTICATION", "AUTH_ERROR", false],
    ["CONFIGURATION", "CONFIG_ERROR", false],
    ["NOT_FOUND", "CONFIG_ERROR", false],
    ["MALFORMED_RESPONSE", "DEGRADED", false],
    ["PERMANENT", "CONFIG_ERROR", false],
  ] as const)(
    "classifies %s failures into health and retry policy",
    async (kind, status, retryable) => {
      const source = await createSource(database);
      const processor = processorFor(database, async () => {
        throw new ConnectorError(kind, {
          code: `TEST_${kind}`,
          ...(kind === "RATE_LIMITED" ? { retryAfterSeconds: 7 } : {}),
        });
      });
      const execution = processor(job(source.id, `job-${kind}`));
      if (retryable)
        await expect(execution).rejects.toBeInstanceOf(RetryableIngestionError);
      else
        await expect(execution).rejects.toMatchObject({
          name: "UnrecoverableError",
        });
      expect(
        await database.source.findUniqueOrThrow({ where: { id: source.id } }),
      ).toMatchObject({
        lastErrorCode: `TEST_${kind}`,
        status,
      });
      expect(
        await database.ingestionRun.findFirstOrThrow({
          orderBy: { startedAt: "desc" },
          where: { sourceId: source.id },
        }),
      ).toMatchObject({ status: "FAILED" });
    },
  );

  it("enforces item, page, and duration limits without advancing beyond committed data", async () => {
    const itemSource = await createSource(database);
    await expect(
      processorFor(
        database,
        async () => ({
          hasMore: false,
          nextCheckpoint: { cursor: "too-many" },
          posts: [connectorPost("one"), connectorPost("two")],
        }),
        { maxItems: 1 },
      )(job(itemSource.id, "item-limit")),
    ).rejects.toMatchObject({
      name: "UnrecoverableError",
    });
    expect(
      await database.sourceCheckpoint.count({
        where: { sourceId: itemSource.id },
      }),
    ).toBe(0);

    const pageSource = await createSource(database);
    await expect(
      processorFor(
        database,
        async () => ({
          hasMore: true,
          nextCheckpoint: { cursor: "page-1" },
          posts: [connectorPost("page-1")],
        }),
        { maxPages: 1 },
      )(job(pageSource.id, "page-limit")),
    ).rejects.toMatchObject({
      name: "UnrecoverableError",
    });
    expect(
      await database.sourceCheckpoint.findFirstOrThrow({
        where: { sourceId: pageSource.id },
      }),
    ).toMatchObject({ valueJson: { cursor: "page-1" } });

    const durationSource = await createSource(database);
    await expect(
      processorFor(
        database,
        (signal) =>
          new Promise((_, reject) => {
            signal.addEventListener(
              "abort",
              () =>
                reject(
                  new ConnectorError("TRANSIENT", {
                    code: "SOURCE_RUN_TIMEOUT",
                  }),
                ),
              { once: true },
            );
          }),
        { maxDurationMs: 20 },
      )(job(durationSource.id, "duration-limit")),
    ).rejects.toBeInstanceOf(RetryableIngestionError);
  });
});

async function createSource(
  database: DatabaseClient,
  overrides: {
    readonly enabled?: boolean;
    readonly nextPollAt?: Date | null;
  } = {},
) {
  return database.source.create({
    data: {
      configJson: {},
      displayName: `Integration source ${randomUUID()}`,
      enabled: overrides.enabled ?? true,
      kind: "RSS",
      nextPollAt: overrides.nextPollAt ?? null,
      status: overrides.enabled === false ? "PAUSED" : "ACTIVE",
    },
  });
}

function normalizedItem(sourceId: string): NormalizedContentInput {
  return {
    canonicalUrl: "https://example.test/meme/1",
    contentRating: "SAFE",
    externalId: "external-1",
    media: [
      { kind: "IMAGE", ordinal: 0, remoteUrl: "https://example.test/meme.png" },
    ],
    providerPublishedAt: now,
    providerUrl: "https://example.test/meme/1",
    publishedAt: now,
    sourceId,
    title: "A deterministic meme",
  };
}

function connectorPost(id: string) {
  return {
    authorName: null,
    categories: [],
    communityName: "Fixture",
    contentRating: "SAFE" as const,
    contentWarning: null,
    externalId: id,
    media: [],
    originalUrl: `https://example.test/${id}`,
    providerCommentCount: null,
    providerCreatedAt: now.toISOString(),
    providerScore: null,
    providerUpdatedAt: null,
    rawPayload: null,
    summary: null,
    title: id,
  };
}

function processorFor(
  database: DatabaseClient,
  fetchPage: (signal: AbortSignal) => Promise<unknown>,
  limits: Partial<{
    maxBytes: number;
    maxDurationMs: number;
    maxItems: number;
    maxPages: number;
    maxRequests: number;
  }> = {},
) {
  const connector = defineConnector({
    fetchPage: async (context) =>
      connectorPageSchema.parse(await fetchPage(context.abortSignal)),
    kind: "RSS",
    validateCheckpoint: (value) => value,
    validateConfig: (value) => value,
    validateConnectivity: async () => ({
      details: {},
      message: "ok",
      ok: true,
    }),
  });
  return createSourcePollProcessor({
    database,
    http: unusedHttp,
    keyring: createCredentialKeyring(1, new Uint8Array(32)),
    limits: {
      maxBytes: 1_000_000,
      maxDurationMs: 2_000,
      maxItems: 100,
      maxPages: 10,
      maxRequests: 10,
      ...limits,
    },
    logger: silentLogger,
    now: () => new Date(),
    registry: new ConnectorRegistry([connector]),
    shutdownSignal: new AbortController().signal,
  });
}

function job(sourceId: string, id: string): never {
  return {
    attemptsMade: 0,
    data: { requestedAt: now.toISOString(), sourceId, trigger: "MANUAL" },
    id,
  } as never;
}
