import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ConnectorRegistry,
  redditConnector,
  type ConnectorHttpClient,
  type ConnectorOAuthToken,
  type ConnectorTokenCache,
  type HardenedHttpResponse,
} from "@mirthspool/connectors";
import { createDatabaseClient, type DatabaseClient } from "@mirthspool/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createCredentialKeyring,
  createSourcePollProcessor,
} from "../../apps/worker/src/processor.js";
import {
  rotateSourceCredential,
  sourceServiceKeyring,
  validateManagedSource,
} from "../../apps/web/src/lib/sources/source-service.js";

const token = fixture("token.json");
const about = fixture("about.json");
const firstPage = fixture("listing-page-1.json");
const secondPage = fixture("listing-page-2.json");
const silentLogger = { debug() {}, error() {}, info() {}, warn() {} };

describe.sequential("Reddit OAuth validation and scheduled ingestion", () => {
  let actorId: string;
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
    const email = `reddit-${randomUUID()}@example.test`;
    actorId = (
      await database.user.create({
        data: {
          email,
          emailNormalized: email,
          name: "Reddit Integration Administrator",
          role: "ADMIN",
        },
      })
    ).id;
  });

  afterAll(async () => {
    await database.ingestionRun.deleteMany();
    await database.sourceCheckpoint.deleteMany();
    await database.sourcePost.deleteMany();
    await database.mediaAsset.deleteMany();
    await database.contentItem.deleteMany();
    await database.source.deleteMany();
    await database.user.delete({ where: { id: actorId } });
    await database.$disconnect();
  });

  it("keeps credentials encrypted, validates through mocked OAuth/API, and ingests idempotently", async () => {
    const source = await database.source.create({
      data: {
        configJson: {
          contentPolicy: "EXCLUDE_ADULT",
          includeStickied: false,
          itemsPerPage: 25,
          minimumScore: 0,
          pageLimit: 2,
          sort: "new",
          subreddit: "MirthFixtures",
          timeWindow: "day",
        },
        displayName: `Reddit integration ${randomUUID()}`,
        enabled: true,
        kind: "REDDIT",
        pollIntervalSeconds: 60,
        status: "ACTIVE",
      },
    });
    const key = Buffer.alloc(32, 7);
    const registry = new ConnectorRegistry([redditConnector]);
    const tokenCache = memoryTokenCache();
    const serviceDependencies = {
      database,
      http: mockReddit(),
      keyring: sourceServiceKeyring(1, key),
      logger: silentLogger,
      now: () => new Date("2026-07-22T18:00:00.000Z"),
      registry,
      tokenCache,
    };
    await rotateSourceCredential(serviceDependencies, actorId, source.id, {
      kind: "OAUTH_CLIENT",
      label: "primary",
      payload: {
        clientId: "fixture_client_id",
        clientSecret: "fixture-client-secret-not-real",
        userAgent: "linux:mirthspool:v0.1 (by /u/fixture_admin)",
      },
    });
    const stored = await database.sourceCredential.findFirstOrThrow({
      where: { sourceId: source.id },
    });
    expect(stored.encryptedPayload.toString()).not.toContain(
      "fixture-client-secret",
    );

    const validation = await validateManagedSource(
      serviceDependencies,
      actorId,
      source.id,
      new AbortController().signal,
    );
    expect(validation).toMatchObject({
      details: { credentialHealth: "valid" },
      ok: true,
    });

    const processor = createSourcePollProcessor({
      database,
      http: mockReddit(),
      keyring: createCredentialKeyring(1, key),
      limits: {
        maxBytes: 5_000_000,
        maxDurationMs: 30_000,
        maxItems: 20,
        maxPages: 3,
        maxRequests: 8,
      },
      logger: silentLogger,
      now: () => new Date("2026-07-22T18:00:00.000Z"),
      registry,
      shutdownSignal: new AbortController().signal,
      tokenCache,
    });
    const first = await processor(job(source.id, "reddit-scheduled-1"));
    expect(first).toMatchObject({ itemsCreated: 7, pagesFetched: 2 });
    expect(
      await database.sourcePost.count({ where: { sourceId: source.id } }),
    ).toBe(7);
    expect(
      await database.ingestionRun.findFirstOrThrow({
        where: { jobId: "reddit-scheduled-1" },
      }),
    ).toMatchObject({
      rateLimitResetAt: new Date("2026-07-22T18:02:00.000Z"),
    });
    expect(
      await database.source.findUniqueOrThrow({ where: { id: source.id } }),
    ).toMatchObject({
      nextPollAt: new Date("2026-07-22T18:02:00.000Z"),
    });

    const second = await processor(job(source.id, "reddit-scheduled-2"));
    expect(second).toMatchObject({ itemsCreated: 0, itemsUpdated: 7 });
    expect(
      await database.sourcePost.count({ where: { sourceId: source.id } }),
    ).toBe(7);
  });
});

function mockReddit(): ConnectorHttpClient {
  return {
    request: async (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/api/v1/access_token")
        return response(token, request.url);
      if (url.pathname.endsWith("/about")) return response(about, request.url);
      const value = url.searchParams.has("after") ? secondPage : firstPage;
      return response(value, request.url, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "120",
      });
    },
  };
}

function memoryTokenCache(): ConnectorTokenCache {
  let value: ConnectorOAuthToken | undefined;
  return { getOrCreate: async (_key, acquire) => (value ??= await acquire()) };
}

function response(
  value: unknown,
  url: string,
  headers: Readonly<Record<string, string>> = {},
): HardenedHttpResponse {
  return {
    body: Buffer.from(JSON.stringify(value)),
    headers: { "content-type": "application/json", ...headers },
    json: (schema) => schema.parse(value),
    status: 200,
    text: () => JSON.stringify(value),
    url,
  };
}

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), `tests/fixtures/reddit/${name}`),
      "utf8",
    ),
  );
}

function job(sourceId: string, id: string) {
  return {
    attemptsMade: 0,
    data: {
      requestedAt: "2026-07-22T18:00:00.000Z",
      sourceId,
      trigger: "SCHEDULED",
    },
    id,
  } as never;
}
