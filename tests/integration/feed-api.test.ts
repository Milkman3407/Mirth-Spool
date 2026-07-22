import {
  contentRandomKey,
  createDatabaseClient,
  hotRankingCoordinate,
  writeSetting,
} from "@mirthspool/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as feedRoute } from "../../apps/web/src/app/api/feed/route.js";
import {
  readContent,
  readFeed,
} from "../../apps/web/src/lib/feed/feed-service.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error("DATABASE_URL is required for feed integration tests");
const database = createDatabaseClient({
  connectionString: databaseUrl,
  maxConnections: 8,
});
const secret = "integration-only-auth-secret-with-32-characters";
const services = { database, secret };
let userId: string;
let sourceId: string;
const ids: string[] = [];

beforeAll(async () => {
  await database.userAction.deleteMany();
  await database.mediaAsset.deleteMany();
  await database.sourcePost.deleteMany();
  await database.contentItem.deleteMany();
  await database.source.deleteMany();
  await database.user.deleteMany();
  await database.appSetting.deleteMany();
  const user = await database.user.create({
    data: {
      email: "feed@example.test",
      emailNormalized: "feed@example.test",
      name: "Feed User",
    },
  });
  const source = await database.source.create({
    data: {
      configJson: {},
      displayName: "Official test feed",
      kind: "RSS",
      priority: 50,
    },
  });
  userId = user.id;
  sourceId = source.id;
  await writeSetting(database, "content.maximumRating", "SENSITIVE");
  const publishedAt = new Date("2026-07-20T12:00:00.000Z");
  for (let index = 0; index < 9; index += 1) {
    const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    ids.push(id);
    const content = await database.contentItem.create({
      data: {
        contentRating: index === 8 ? "SENSITIVE" : "SAFE",
        id,
        publishedAt,
        randomKey: contentRandomKey(id),
        rankingScore: hotRankingCoordinate({
          providerScore: 10,
          publishedAt,
          sourcePriority: 50,
        }),
        title: `Item ${index + 1}`,
      },
    });
    const post = await database.sourcePost.create({
      data: {
        contentItemId: content.id,
        externalId: `official-${index + 1}`,
        providerScore: 10,
        providerUrl: `https://example.test/posts/${index + 1}`,
        sourceId,
      },
    });
    await database.mediaAsset.create({
      data: {
        contentItemId: content.id,
        kind: index === 8 ? "VIDEO" : "IMAGE",
        ordinal: 0,
        remoteUrl: `https://example.test/media/${index + 1}`,
      },
    });
    await database.contentItem.update({
      data: { primarySourcePostId: post.id },
      where: { id },
    });
  }
  await database.userAction.create({
    data: { contentItemId: ids[7]!, kind: "HIDE", userId },
  });
});

afterAll(async () => {
  await database.userAction.deleteMany({ where: { userId } });
  await database.mediaAsset.deleteMany({
    where: { contentItemId: { in: ids } },
  });
  await database.sourcePost.deleteMany({
    where: { contentItemId: { in: ids } },
  });
  await database.contentItem.deleteMany({ where: { id: { in: ids } } });
  await database.source.deleteMany({ where: { id: sourceId } });
  await database.user.deleteMany({ where: { id: userId } });
  await database.appSetting.deleteMany();
  await database.$disconnect();
});

describe.sequential("feed API and repository", () => {
  it("requires authentication", async () => {
    const response = await feedRoute(new Request("http://localhost/api/feed"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });
  });

  it.each(["new", "hot", "unseen"] as const)(
    "paginates %s with equal keys and no duplicates",
    async (mode) => {
      const seen = new Set<string>();
      let cursor: string | null = null;
      do {
        const page = await readFeed(
          services,
          userId,
          `http://localhost/api/feed?mode=${mode}&limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        for (const item of page.items) {
          expect(seen.has(item.id)).toBe(false);
          seen.add(item.id);
        }
        cursor = page.nextCursor;
      } while (cursor);
      expect(seen.size).toBe(8);
    },
  );

  it("keeps random stable for a seed without duplicates across wraparound", async () => {
    async function collect() {
      const result: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await readFeed(
          services,
          userId,
          `http://localhost/api/feed?mode=random&limit=2&seed=fixed_seed${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        result.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor;
      } while (cursor);
      return result;
    }
    const first = await collect();
    expect(first).toEqual(await collect());
    expect(new Set(first).size).toBe(first.length);
    expect(first).toHaveLength(8);
    const generated = await readFeed(
      services,
      userId,
      "http://localhost/api/feed?mode=random&limit=2",
    );
    expect(generated.seed).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  it("binds cursors, composes filters, and enforces rating and unseen actions", async () => {
    const first = await readFeed(
      services,
      userId,
      "http://localhost/api/feed?mode=new&limit=2",
    );
    await expect(
      readFeed(
        services,
        userId,
        `http://localhost/api/feed?mode=hot&limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`,
      ),
    ).rejects.toThrow("INVALID_CURSOR");
    await expect(
      readFeed(
        services,
        userId,
        `http://localhost/api/feed?mode=new&limit=2&cursor=${encodeURIComponent(`${first.nextCursor!.slice(0, -1)}x`)}`,
      ),
    ).rejects.toThrow("INVALID_CURSOR");
    const filtered = await readFeed(
      services,
      userId,
      `http://localhost/api/feed?sourceId=${sourceId}&mediaKind=video&rating=sensitive`,
    );
    expect(filtered.items.map((item) => item.id)).toEqual([ids[8]]);
    await writeSetting(database, "content.maximumRating", "SAFE");
    expect(
      (
        await readFeed(
          services,
          userId,
          "http://localhost/api/feed?rating=adult",
        )
      ).items.some((item) => item.id === ids[8]),
    ).toBe(false);
    await database.userAction.create({
      data: { contentItemId: ids[0]!, kind: "VIEW", userId },
    });
    expect(
      (
        await readFeed(
          services,
          userId,
          "http://localhost/api/feed?mode=unseen",
        )
      ).items.some((item) => item.id === ids[0]),
    ).toBe(false);
    expect(
      (
        await readFeed(
          services,
          userId,
          "http://localhost/api/feed?mode=unseen&includeSeen=true",
        )
      ).items.some((item) => item.id === ids[0]),
    ).toBe(true);
  });

  it("returns sanitized detail with original attribution", async () => {
    const content = await readContent(services, userId, ids[0]!);
    expect(content).toMatchObject({
      id: ids[0],
      primarySource: {
        displayName: "Official test feed",
        providerUrl: "https://example.test/posts/1",
      },
    });
    expect(content?.sources).toHaveLength(1);
    expect(JSON.stringify(content)).not.toContain("rawPayload");
  });

  it("uses intended indexes for representative generated data", async () => {
    await database.$executeRawUnsafe(
      `INSERT INTO "ContentItem" ("id", "title", "contentRating", "status", "publishedAt", "randomKey", "rankingScore", "updatedAt") SELECT (substr(md5(g::text),1,8)||'-'||substr(md5(g::text),9,4)||'-4'||substr(md5(g::text),14,3)||'-8'||substr(md5(g::text),18,3)||'-'||substr(md5(g::text),21,12))::uuid, 'load', 'SAFE'::"ContentRating", 'ACTIVE'::"ContentStatus", now() - (g || ' seconds')::interval, (g % 2147483647)::integer, g::double precision, now() FROM generate_series(1000, 100999) g ON CONFLICT DO NOTHING`,
    );
    await database.$executeRawUnsafe("SET enable_seqscan = off");
    for (const [sql, index] of [
      [
        `EXPLAIN (FORMAT JSON) SELECT id FROM "ContentItem" WHERE status = 'ACTIVE'::"ContentStatus" ORDER BY "publishedAt" DESC, id DESC LIMIT 50`,
        "ContentItem_feed_new_idx",
      ],
      [
        `EXPLAIN (FORMAT JSON) SELECT id FROM "ContentItem" WHERE status = 'ACTIVE'::"ContentStatus" ORDER BY "rankingScore" DESC, "publishedAt" DESC, id DESC LIMIT 50`,
        "ContentItem_feed_hot_idx",
      ],
      [
        `EXPLAIN (FORMAT JSON) SELECT id FROM "ContentItem" WHERE status = 'ACTIVE'::"ContentStatus" AND "randomKey" >= 42 ORDER BY "randomKey", id LIMIT 50`,
        "ContentItem_feed_random_idx",
      ],
    ] as const) {
      const plan = await database.$queryRawUnsafe(sql);
      expect(JSON.stringify(plan)).toContain(index);
    }
    await database.contentItem.deleteMany({ where: { title: "load" } });
  }, 90_000);
});
