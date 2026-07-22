import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ConnectorRegistry,
  mastodonConnector,
  type ConnectorHttpClient,
  type HardenedHttpResponse,
} from "@mirthspool/connectors";
import { createDatabaseClient, type DatabaseClient } from "@mirthspool/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createCredentialKeyring,
  createSourcePollProcessor,
} from "../../apps/worker/src/processor.js";
import {
  sourceServiceKeyring,
  validateManagedSource,
} from "../../apps/web/src/lib/sources/source-service.js";

const instance = fixture("instance.json");
const tag = fixture("tag.json");
const firstPage = fixture("hashtag-page-1.json");
const secondPage = fixture("page-2.json");
const silentLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};

describe.sequential(
  "public Mastodon validation and scheduled ingestion",
  () => {
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
      const actorEmail = `mastodon-${randomUUID()}@example.test`;
      actorId = (
        await database.user.create({
          data: {
            email: actorEmail,
            emailNormalized: actorEmail,
            name: "Mastodon Integration Administrator",
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

    it("validates through the source service and ingests idempotently with origin-locked checkpoints", async () => {
      const source = await database.source.create({
        data: {
          configJson: {
            identifier: "Memes",
            includeReblogs: true,
            instanceUrl: "https://mastodon.example",
            itemsPerPage: 4,
            language: "en",
            minimumMedia: 1,
            mode: "HASHTAG",
            pageLimit: 2,
          },
          displayName: `Mastodon integration ${randomUUID()}`,
          enabled: true,
          kind: "MASTODON",
          pollIntervalSeconds: 900,
          status: "ACTIVE",
        },
      });
      const http = mockInstance();
      const registry = new ConnectorRegistry([mastodonConnector]);
      const validation = await validateManagedSource(
        {
          database,
          http,
          keyring: sourceServiceKeyring(1, Buffer.alloc(32, 9)),
          logger: silentLogger,
          now: () => new Date("2026-07-22T18:00:00.000Z"),
          registry,
        },
        actorId,
        source.id,
        new AbortController().signal,
      );
      expect(validation).toMatchObject({
        details: { resolvedTarget: "#Memes" },
        ok: true,
      });

      const processor = createSourcePollProcessor({
        database,
        http,
        keyring: createCredentialKeyring(1, Buffer.alloc(32, 9)),
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
      });
      const first = await processor(job(source.id, "mastodon-scheduled-1"));
      expect(first).toMatchObject({ itemsCreated: 4, pagesFetched: 2 });
      expect(
        await database.sourceCheckpoint.findUniqueOrThrow({
          where: { sourceId_scope: { scope: "poll", sourceId: source.id } },
        }),
      ).toMatchObject({
        valueJson: { nextUrl: null, page: 1, sinceId: "9001" },
      });
      const occurrences = await database.sourcePost.findMany({
        include: { contentItem: { include: { mediaAssets: true } } },
        orderBy: { externalId: "asc" },
        where: { sourceId: source.id },
      });
      expect(occurrences).toHaveLength(4);
      const sensitive = occurrences.find((item) => item.externalId === "9001")!;
      expect(sensitive).toMatchObject({
        providerFavouriteCount: 5,
        providerLanguage: "en",
        providerShareCount: 4,
      });
      expect(sensitive.providerAuthor).not.toMatch(/<|onerror|script/iu);
      expect(sensitive.contentItem.contentWarning).toBe("Flashing & synthetic");
      expect(sensitive.contentItem.mediaAssets[0]?.altText).toBe(
        "A safe & bounded alt",
      );
      expect(
        occurrences.find((item) => item.externalId === "8001")?.boostedBy,
      ).toBe("Booster (@booster@remote.example)");

      const second = await processor(job(source.id, "mastodon-scheduled-2"));
      expect(second).toMatchObject({ itemsCreated: 0, itemsSeen: 0 });
      expect(
        await database.sourcePost.count({ where: { sourceId: source.id } }),
      ).toBe(4);
    });
  },
);

function mockInstance(): ConnectorHttpClient {
  return {
    request: async (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/api/v2/instance") {
        return response(instance, request.url);
      }
      if (url.pathname === "/api/v1/tags/Memes") {
        return response(tag, request.url);
      }
      if (url.searchParams.has("since_id")) {
        return response([], request.url);
      }
      if (url.searchParams.has("max_id")) {
        return response(secondPage, request.url);
      }
      return response(firstPage, request.url, {
        link: '<https://mastodon.example/api/v1/timelines/tag/Memes?limit=4&only_media=true&max_id=8001>; rel="next"',
        "x-ratelimit-remaining": "99",
      });
    },
  };
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
      resolve(process.cwd(), `tests/fixtures/mastodon/${name}`),
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
