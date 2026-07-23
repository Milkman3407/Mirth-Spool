import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { HttpTransport, TransportResponse } from "@mirthspool/connectors";
import {
  createDatabaseClient,
  writeUserPreferences,
  writeSetting,
  type DatabaseClient,
} from "@mirthspool/db";
import {
  HardenedMediaClient,
  LocalFilesystemStorage,
  createStorageKey,
} from "@mirthspool/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createMediaCacheProcessor,
  scheduleMediaCache,
} from "../../apps/worker/src/media-cache.js";
import { openCachedMedia } from "../../apps/web/src/lib/cache/cache-service.js";

const now = new Date("2026-07-22T18:00:00.000Z");
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.alloc(32, 7),
]);
const silentLogger = { error() {}, info() {}, warn() {} };

describe.sequential("bounded media cache lifecycle", () => {
  let database: DatabaseClient;
  let mediaId: string;
  let root: string;
  let storage: LocalFilesystemStorage;
  let strictUserId: string;
  let userId: string;

  beforeAll(async () => {
    database = createDatabaseClient({
      connectionString: process.env.DATABASE_URL!,
    });
    await database.userAction.deleteMany();
    await database.mediaAsset.deleteMany();
    await database.contentItem.deleteMany();
    await database.appSetting.deleteMany({
      where: {
        OR: [
          { key: { startsWith: "cache." } },
          { key: "content.maximumRating" },
        ],
      },
    });
    const email = `cache-${randomUUID()}@example.test`;
    userId = (
      await database.user.create({
        data: {
          email,
          emailNormalized: email,
          name: "Cache test administrator",
          role: "ADMIN",
        },
      })
    ).id;
    const strictEmail = `cache-strict-${randomUUID()}@example.test`;
    strictUserId = (
      await database.user.create({
        data: {
          email: strictEmail,
          emailNormalized: strictEmail,
          name: "Strict cache member",
          preferences: { create: { maximumContentRating: "SAFE" } },
          role: "MEMBER",
        },
      })
    ).id;
    const content = await database.contentItem.create({
      data: {
        contentRating: "SAFE",
        publishedAt: now,
        title: "Cache integration fixture",
      },
    });
    mediaId = (
      await database.mediaAsset.create({
        data: {
          contentItemId: content.id,
          kind: "IMAGE",
          mimeType: "image/png",
          ordinal: 0,
          remoteUrl: "https://media.example.test/image.png",
        },
      })
    ).id;
    await database.userAction.create({
      data: { contentItemId: content.id, kind: "FAVORITE", userId },
    });
    await Promise.all([
      writeSetting(database, "cache.policy", "FAVORITES_ONLY"),
      writeSetting(database, "cache.maxObjectBytes", 1_000_000),
      writeSetting(database, "cache.quotaBytes", 10_000_000),
    ]);
    root = await mkdtemp(path.join(tmpdir(), "mirthspool-cache-integration-"));
    storage = new LocalFilesystemStorage(root);
  });

  afterAll(async () => {
    await database.userAction.deleteMany();
    await database.mediaAsset.deleteMany();
    await database.contentItem.deleteMany();
    await database.appSetting.deleteMany({
      where: {
        OR: [
          { key: { startsWith: "cache." } },
          { key: "content.maximumRating" },
        ],
      },
    });
    await database.user.deleteMany({
      where: { id: { in: [userId, strictUserId] } },
    });
    await database.$disconnect();
    await rm(root, { force: true, recursive: true });
  });

  it("coalesces duplicate scheduling and persists exactly one verified object", async () => {
    const queued: unknown[] = [];
    const queue = {
      add: async (_name: "cache", data: unknown) => {
        queued.push(data);
        return { id: `cache-${mediaId}` };
      },
    };
    const counts = await Promise.all([
      scheduleMediaCache(database, queue, now),
      scheduleMediaCache(database, queue, now),
    ]);
    expect(counts.reduce((sum, value) => sum + value, 0)).toBe(1);
    expect(queued).toHaveLength(1);

    const processor = createMediaCacheProcessor({
      database,
      logger: silentLogger,
      mediaClient: mediaClient(png),
      now: () => now,
      shutdownSignal: new AbortController().signal,
      storage,
    });
    const job = {
      data: { mediaId, requestedAt: now.toISOString() },
      id: `cache-${mediaId}`,
    } as never;
    await expect(processor(job)).resolves.toMatchObject({ mediaId });
    await expect(processor(job)).resolves.toEqual({ coalesced: true });
    const asset = await database.mediaAsset.findUniqueOrThrow({
      where: { id: mediaId },
    });
    expect(asset).toMatchObject({
      cacheState: "CACHED",
      mimeType: "image/png",
    });
    expect(await storage.listByPrefix("objects", 10)).toHaveLength(1);
  });

  it("serves authenticated-service bytes with safe headers and rating filtering", async () => {
    const response = await openCachedMedia(
      { database, storage },
      {
        ifNoneMatch: null,
        mediaId,
        method: "GET",
        now,
        range: null,
        userId,
      },
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response?.headers.get("content-security-policy")).toContain(
      "sandbox",
    );
    expect(Buffer.from(await response!.arrayBuffer())).toEqual(png);

    const cached = await database.mediaAsset.findUniqueOrThrow({
      where: { id: mediaId },
    });
    const notModified = await openCachedMedia(
      { database, storage },
      {
        ifNoneMatch: `"${cached.sha256}"`,
        mediaId,
        method: "GET",
        now,
        range: null,
        userId,
      },
    );
    expect(notModified?.status).toBe(304);

    await database.contentItem.update({
      data: { contentRating: "ADULT" },
      where: { id: cached.contentItemId },
    });
    await expect(
      openCachedMedia(
        { database, storage },
        {
          ifNoneMatch: null,
          mediaId,
          method: "GET",
          now,
          range: null,
          userId,
        },
      ),
    ).resolves.toBeNull();
    await Promise.all([
      writeSetting(database, "content.maximumRating", "ADULT"),
      writeUserPreferences(database, userId, {
        maximumContentRating: "ADULT",
      }),
    ]);
    await expect(
      openCachedMedia(
        { database, storage },
        {
          ifNoneMatch: null,
          mediaId,
          method: "GET",
          now,
          range: null,
          userId,
        },
      ),
    ).resolves.toBeInstanceOf(Response);
    await expect(
      openCachedMedia(
        { database, storage },
        {
          ifNoneMatch: null,
          mediaId,
          method: "GET",
          now,
          range: null,
          userId: strictUserId,
        },
      ),
    ).resolves.toBeNull();
  });

  it("cleans an invalid partial download without replacing durable objects", async () => {
    const before = await storage.listByPrefix("objects", 10);
    const blockedId = await createQueuedFavorite(
      "https://media.example.test/disguised.png",
    );
    const processor = createMediaCacheProcessor({
      database,
      logger: silentLogger,
      mediaClient: mediaClient(Buffer.from("<html><body>not an image</body>")),
      now: () => now,
      shutdownSignal: new AbortController().signal,
      storage,
    });
    await expect(processor(job(blockedId))).rejects.toThrow();
    expect(
      await database.mediaAsset.findUniqueOrThrow({ where: { id: blockedId } }),
    ).toMatchObject({ cacheState: "BLOCKED", storageKey: null });
    expect(await storage.listByPrefix("objects", 10)).toHaveLength(
      before.length,
    );
  });

  it("evicts a non-favorite under the quota lock while protecting favorites", async () => {
    const staleContent = await database.contentItem.create({
      data: {
        contentRating: "SAFE",
        publishedAt: now,
        title: "Stale cached object",
      },
    });
    const staleKey = await store(Buffer.from("stale"));
    const stale = await database.mediaAsset.create({
      data: {
        byteLength: 9_500_000n,
        cachedAt: new Date(now.valueOf() - 60_000),
        cachePolicy: "ALL_WITHIN_QUOTA",
        cacheState: "CACHED",
        contentItemId: staleContent.id,
        kind: "IMAGE",
        lastAccessedAt: new Date(now.valueOf() - 60_000),
        mimeType: "image/png",
        ordinal: 0,
        remoteUrl: "https://media.example.test/stale.png",
        sha256: createHash("sha256").update("stale").digest("hex"),
        storageKey: staleKey,
      },
    });
    const nextId = await createQueuedFavorite(
      "https://media.example.test/next.png",
    );
    const processor = createMediaCacheProcessor({
      database,
      logger: silentLogger,
      mediaClient: mediaClient(png),
      now: () => now,
      shutdownSignal: new AbortController().signal,
      storage,
    });
    await expect(processor(job(nextId))).resolves.toMatchObject({
      mediaId: nextId,
    });
    expect(
      await database.mediaAsset.findUniqueOrThrow({ where: { id: stale.id } }),
    ).toMatchObject({
      cacheState: "EVICTED",
      storageKey: null,
    });
    expect(await storage.stat(staleKey)).toBeNull();
    expect(
      await database.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } }),
    ).toMatchObject({
      cacheState: "CACHED",
    });
  });

  it("serves a representative cached video HEAD and byte range", async () => {
    const video = Buffer.concat([
      Buffer.alloc(4),
      Buffer.from("ftyp"),
      Buffer.from("mirthspool"),
    ]);
    const content = await database.contentItem.create({
      data: { contentRating: "SAFE", publishedAt: now, title: "Cached video" },
    });
    const storageKey = await store(video);
    const asset = await database.mediaAsset.create({
      data: {
        byteLength: BigInt(video.byteLength),
        cachedAt: now,
        cachePolicy: "FAVORITES_ONLY",
        cacheState: "CACHED",
        contentItemId: content.id,
        kind: "VIDEO",
        lastAccessedAt: now,
        mimeType: "video/mp4",
        ordinal: 0,
        remoteUrl: "https://media.example.test/video.mp4",
        sha256: createHash("sha256").update(video).digest("hex"),
        storageKey,
      },
    });
    const head = await openCachedMedia(
      { database, storage },
      {
        ifNoneMatch: null,
        mediaId: asset.id,
        method: "HEAD",
        now,
        range: null,
        userId,
      },
    );
    expect(head?.status).toBe(200);
    expect(head?.headers.get("content-length")).toBe(String(video.byteLength));
    const range = await openCachedMedia(
      { database, storage },
      {
        ifNoneMatch: null,
        mediaId: asset.id,
        method: "GET",
        now,
        range: "bytes=4-7",
        userId,
      },
    );
    expect(range?.status).toBe(206);
    expect(range?.headers.get("content-range")).toBe(
      `bytes 4-7/${video.byteLength}`,
    );
    expect(Buffer.from(await range!.arrayBuffer()).toString("ascii")).toBe(
      "ftyp",
    );
  });

  async function createQueuedFavorite(remoteUrl: string) {
    const content = await database.contentItem.create({
      data: { contentRating: "SAFE", publishedAt: now, title: remoteUrl },
    });
    await database.userAction.create({
      data: { contentItemId: content.id, kind: "FAVORITE", userId },
    });
    return (
      await database.mediaAsset.create({
        data: {
          cacheState: "QUEUED",
          contentItemId: content.id,
          kind: "IMAGE",
          mimeType: "image/png",
          ordinal: 0,
          remoteUrl,
        },
      })
    ).id;
  }

  async function store(bytes: Uint8Array) {
    const key = createStorageKey();
    const prepared = await storage.prepareWrite(
      key,
      (async function* () {
        yield bytes;
      })(),
      1_000_000,
    );
    await prepared.commit();
    return key;
  }
});

function job(mediaId: string) {
  return {
    data: { mediaId, requestedAt: now.toISOString() },
    id: `cache-${mediaId}`,
  } as never;
}

function mediaClient(bytes: Uint8Array) {
  const transport: HttpTransport = {
    request: async (): Promise<TransportResponse> => ({
      body: (async function* () {
        yield bytes.subarray(0, 5);
        yield bytes.subarray(5);
      })(),
      cancel() {},
      headers: {
        "content-length": String(bytes.byteLength),
        "content-type": "image/png",
      },
      status: 200,
    }),
  };
  return new HardenedMediaClient({
    resolver: {
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
    },
    transport,
  });
}
