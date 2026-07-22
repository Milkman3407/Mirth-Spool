import {
  createDatabaseClient,
  createSource,
  getSettingDefault,
  readSetting,
  updateMediaCacheMetadata,
  upsertNormalizedContent,
  validateSetting,
  writeSetting,
} from "@mirthspool/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error("DATABASE_URL is required for database integration tests");
}

const client = createDatabaseClient({
  connectionString: databaseUrl,
  maxConnections: 8,
});

afterAll(async () => {
  await client.$disconnect();
});

beforeEach(async () => {
  await client.auditEvent.deleteMany();
  await client.duplicateLink.deleteMany();
  await client.contentTag.deleteMany();
  await client.userAction.deleteMany();
  await client.session.deleteMany();
  await client.mediaAsset.deleteMany();
  await client.sourcePost.deleteMany();
  await client.contentItem.deleteMany();
  await client.ingestionRun.deleteMany();
  await client.sourceCheckpoint.deleteMany();
  await client.sourceCredential.deleteMany();
  await client.source.deleteMany();
  await client.user.deleteMany();
  await client.appSetting.deleteMany();
  await client.tag.deleteMany();
  await client.duplicateGroup.deleteMany();
});

describe("normalized content persistence", () => {
  it("is idempotent for sequential and concurrent duplicate occurrences", async () => {
    const source = await syntheticSource();
    const input = syntheticContent(source.id, "opaque:post/001");

    const first = await upsertNormalizedContent(client, input);
    const second = await upsertNormalizedContent(client, input);
    const concurrent = await Promise.all(
      Array.from({ length: 6 }, () => upsertNormalizedContent(client, input)),
    );

    expect(second.id).toBe(first.id);
    expect(new Set(concurrent.map((item) => item.id))).toEqual(
      new Set([first.id]),
    );
    expect(await client.contentItem.count()).toBe(1);
    expect(await client.sourcePost.count()).toBe(1);
    expect(await client.mediaAsset.count()).toBe(1);
  });

  it("rolls back content and occurrence creation when media persistence fails", async () => {
    const source = await syntheticSource();
    const input = syntheticContent(source.id, "rollback-case");

    await expect(
      upsertNormalizedContent(client, {
        ...input,
        media: [
          input.media[0]!,
          {
            ...input.media[0]!,
            remoteUrl: "https://example.invalid/duplicate.png",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    expect(await client.contentItem.count()).toBe(0);
    expect(await client.sourcePost.count()).toBe(0);
    expect(await client.mediaAsset.count()).toBe(0);
  });
});

describe("settings and lifecycle semantics", () => {
  it("rejects secret-shaped fields in source configuration", async () => {
    await expect(
      createSource(client, {
        displayName: "Unsafe synthetic source",
        kind: "RSS",
        configJson: {
          feedUrl: "https://example.invalid/feed.xml",
          nested: { accessToken: "must-not-be-stored" },
        },
      }),
    ).rejects.toThrow(/must not contain secrets/);
    expect(await client.source.count()).toBe(0);
  });

  it("uses validated defaults and rejects invalid stored or submitted values", async () => {
    expect(await readSetting(client, "feed.pageSize")).toBe(
      getSettingDefault("feed.pageSize"),
    );
    expect(await writeSetting(client, "feed.pageSize", 25)).toBe(25);
    expect(await readSetting(client, "feed.pageSize")).toBe(25);
    expect(() => validateSetting("feed.pageSize", 1000)).toThrow();

    await client.appSetting.update({
      where: { key: "feed.pageSize" },
      data: { value: "not-a-number" },
    });
    await expect(readSetting(client, "feed.pageSize")).rejects.toThrow();
  });

  it("preserves attribution on source soft deletion and cascades explicit content/user deletion", async () => {
    const source = await syntheticSource();
    const content = await upsertNormalizedContent(
      client,
      syntheticContent(source.id, "lifecycle-case"),
    );
    const user = await client.user.create({
      data: {
        email: "synthetic@example.invalid",
        emailNormalized: "synthetic@example.invalid",
        name: "Synthetic administrator",
        role: "ADMIN",
      },
    });
    await client.session.create({
      data: {
        sessionToken: "synthetic-session-hash",
        userId: user.id,
        expires: new Date("2030-01-01T00:00:00.000Z"),
      },
    });
    await client.userAction.create({
      data: { userId: user.id, contentItemId: content.id, kind: "FAVORITE" },
    });

    await client.source.update({
      where: { id: source.id },
      data: { enabled: false, status: "PAUSED" },
    });
    expect(await client.sourcePost.count()).toBe(1);
    await expect(
      client.source.delete({ where: { id: source.id } }),
    ).rejects.toMatchObject({
      code: "P2003",
    });

    await client.user.delete({ where: { id: user.id } });
    expect(await client.session.count()).toBe(0);
    expect(await client.userAction.count()).toBe(0);
    expect(await client.contentItem.count()).toBe(1);

    const media = await client.mediaAsset.findFirstOrThrow();
    await updateMediaCacheMetadata(client, {
      id: media.id,
      state: "EVICTED",
      storageKey: null,
      cachedAt: null,
    });
    expect(await client.mediaAsset.count()).toBe(1);

    await client.contentItem.delete({ where: { id: content.id } });
    expect(await client.sourcePost.count()).toBe(0);
    expect(await client.mediaAsset.count()).toBe(0);
  });
});

async function syntheticSource() {
  return createSource(client, {
    displayName: "Synthetic integration source",
    kind: "RSS",
    configJson: { feedUrl: "https://example.invalid/feed.xml" },
  });
}

function syntheticContent(sourceId: string, externalId: string) {
  return {
    sourceId,
    externalId,
    title: "Synthetic test item",
    normalizedTitle: "synthetic test item",
    contentRating: "SAFE" as const,
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    canonicalUrl: `https://example.invalid/posts/${encodeURIComponent(externalId)}`,
    media: [
      {
        ordinal: 0,
        kind: "IMAGE" as const,
        remoteUrl: "https://example.invalid/media/synthetic.png",
        mimeType: "image/png",
      },
    ],
  };
}
