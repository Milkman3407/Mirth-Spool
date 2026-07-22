import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ConnectorRegistry,
  lemmyConnector,
  type ConnectorHttpClient,
  type HardenedHttpResponse,
} from "@mirthspool/connectors";
import { createDatabaseClient, type DatabaseClient } from "@mirthspool/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createCredentialKeyring,
  createSourcePollProcessor,
} from "../../apps/worker/src/processor.js";

const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "tests/fixtures/lemmy/posts-page-1.json"),
    "utf8",
  ),
) as { posts: Array<Record<string, unknown>> };
const silentLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};

describe.sequential("scheduled Lemmy ingestion", () => {
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

  it("advances checkpoints, updates health, remains idempotent, and records removal", async () => {
    const source = await database.source.create({
      data: {
        configJson: {
          community: "memes",
          contentPolicy: "INCLUDE_ADULT",
          instanceUrl: "https://lemmy.example",
          itemsPerPage: 2,
          minimumScore: 0,
          pageLimit: 2,
          sort: "New",
        },
        displayName: `Lemmy integration ${randomUUID()}`,
        enabled: true,
        kind: "LEMMY",
        pollIntervalSeconds: 900,
        status: "ACTIVE",
      },
    });
    let removed = false;
    const http: ConnectorHttpClient = {
      request: async (request) => {
        const page = Number(new URL(request.url).searchParams.get("page"));
        const posts =
          page === 1 ? fixture.posts.slice(0, 2) : fixture.posts.slice(2, 3);
        const value = structuredClone({ posts });
        if (removed && page === 1) {
          const post = value.posts[0]?.post as Record<string, unknown>;
          post.removed = true;
        }
        return jsonResponse(value, request.url);
      },
    };
    let clock = new Date("2026-07-22T14:00:00.000Z");
    const processor = createSourcePollProcessor({
      database,
      http,
      keyring: createCredentialKeyring(1, Buffer.alloc(32, 7)),
      limits: {
        maxBytes: 5_000_000,
        maxDurationMs: 30_000,
        maxItems: 20,
        maxPages: 3,
        maxRequests: 4,
      },
      logger: silentLogger,
      now: () => clock,
      registry: new ConnectorRegistry([lemmyConnector]),
      shutdownSignal: new AbortController().signal,
    });

    const first = await processor(job(source.id, "lemmy-scheduled-1"));
    expect(first).toMatchObject({
      itemsCreated: 3,
      itemsSeen: 3,
      pagesFetched: 2,
      providerRequests: 2,
    });
    expect(
      await database.sourceCheckpoint.findUniqueOrThrow({
        where: { sourceId_scope: { scope: "poll", sourceId: source.id } },
      }),
    ).toMatchObject({ valueJson: { page: 1, seenExternalIds: [] } });
    expect(
      await database.source.findUniqueOrThrow({ where: { id: source.id } }),
    ).toMatchObject({
      consecutiveFailures: 0,
      lastErrorCode: null,
      status: "ACTIVE",
    });

    removed = true;
    clock = new Date("2026-07-22T15:00:00.000Z");
    const second = await processor(job(source.id, "lemmy-scheduled-2"));
    expect(second).toMatchObject({ itemsCreated: 0, itemsUpdated: 3 });
    expect(
      await database.sourcePost.count({ where: { sourceId: source.id } }),
    ).toBe(3);
    const removedOccurrence = await database.sourcePost.findUniqueOrThrow({
      include: { contentItem: true },
      where: {
        sourceId_externalId: { externalId: "1001", sourceId: source.id },
      },
    });
    expect(removedOccurrence.providerDeletedAt).toEqual(clock);
    expect(removedOccurrence.contentItem.status).toBe("REMOVED_AT_SOURCE");
    expect(
      await database.ingestionRun.findMany({
        orderBy: { startedAt: "asc" },
        where: { sourceId: source.id },
      }),
    ).toHaveLength(2);
  });
});

function jsonResponse(value: unknown, url: string): HardenedHttpResponse {
  return {
    body: Buffer.from(JSON.stringify(value)),
    headers: { "content-type": "application/json" },
    json: (schema) => schema.parse(value),
    status: 200,
    text: () => JSON.stringify(value),
    url,
  };
}

function job(sourceId: string, id: string) {
  return {
    attemptsMade: 0,
    data: {
      requestedAt: "2026-07-22T14:00:00.000Z",
      sourceId,
      trigger: "SCHEDULED",
    },
    id,
  } as never;
}
