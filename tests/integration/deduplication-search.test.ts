import { createHash, randomUUID } from "node:crypto";

import {
  addAdminTag,
  createDatabaseClient,
  findDuplicateMatches,
  mergeDuplicateItems,
  splitDuplicateItem,
  writeSetting,
} from "@mirthspool/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readSearch } from "../../apps/web/src/lib/search/search-service.js";

const database = createDatabaseClient({
  connectionString: process.env.DATABASE_URL!,
});
const secret = "REDACTED_SYNTHETIC_FIXTURE";
const suffix = randomUUID();
const contentIds: string[] = [];
const sourceIds: string[] = [];
let userId: string;

describe.sequential("M14 deduplication and search", () => {
  beforeAll(async () => {
    const user = await database.user.create({
      data: {
        email: `m14-${suffix}@example.test`,
        emailNormalized: `m14-${suffix}@example.test`,
        name: "M14 administrator",
        role: "ADMIN",
      },
    });
    userId = user.id;
    await writeSetting(database, "content.maximumRating", "SENSITIVE");
    for (const [index, kind] of [
      "RSS",
      "LEMMY",
      "MASTODON",
      "REDDIT",
    ].entries()) {
      const source = await database.source.create({
        data: {
          configJson: {},
          displayName: `M14 ${kind} ${suffix}`,
          kind: kind as "RSS" | "LEMMY" | "MASTODON" | "REDDIT",
          priority: 100 - index,
        },
      });
      sourceIds.push(source.id);
      const content = await database.contentItem.create({
        data: {
          authorName: index === 2 ? "笑顔" : `author-${index}`,
          canonicalUrl: "https://example.test/story?id=42",
          canonicalUrlHash: createHash("sha256")
            .update("story-42")
            .digest("hex"),
          contentRating: "SAFE",
          publishedAt: new Date(`2026-07-2${index}T12:00:00.000Z`),
          title: index === 0 ? "Excellent primary mirth" : `Alternate ${index}`,
        },
      });
      contentIds.push(content.id);
      await database.sourcePost.create({
        data: {
          communityName: `community-${kind.toLowerCase()}`,
          contentItemId: content.id,
          externalId: `m14-${suffix}-${kind}`,
          providerScore: 50 - index,
          providerUrl: `https://example.test/${kind.toLowerCase()}/${suffix}`,
          sourceId: source.id,
        },
      });
      await database.mediaAsset.create({
        data: {
          cacheState: index === 0 ? "CACHED" : "REMOTE_ONLY",
          contentItemId: content.id,
          height: 800,
          kind: "IMAGE",
          mimeType: "image/png",
          ordinal: 0,
          remoteUrl: `https://example.test/media/${suffix}/${index}.png`,
          sha256: createHash("sha256")
            .update("identical-safe-raster")
            .digest("hex"),
          storageKey: index === 0 ? `m14/${suffix}/primary` : null,
          width: 1200,
        },
      });
    }
  });

  afterAll(async () => {
    await database.auditEvent.deleteMany({ where: { actorUserId: userId } });
    await database.userAction.deleteMany({ where: { userId } });
    await database.contentItem.deleteMany({
      where: { id: { in: contentIds } },
    });
    await database.duplicateGroup.deleteMany({
      where: { primaryContentId: null },
    });
    await database.source.deleteMany({ where: { id: { in: sourceIds } } });
    await database.user.delete({ where: { id: userId } });
    await database.$disconnect();
  });

  it("narrows candidates, groups four provider occurrences, and preserves alternates", async () => {
    expect(
      await findDuplicateMatches(database, contentIds[0]!, 2),
    ).toHaveLength(2);
    let result = await mergeDuplicateItems(database, {
      leftContentId: contentIds[0]!,
      reason: "SHA256",
      rightContentId: contentIds[1]!,
    });
    for (const contentId of contentIds.slice(2)) {
      result = await mergeDuplicateItems(database, {
        leftContentId: result.primaryContentId,
        reason: "CANONICAL_URL",
        rightContentId: contentId,
      });
    }
    expect(result.primaryContentId).toBe(contentIds[0]);
    const group = await database.duplicateGroup.findUniqueOrThrow({
      include: { items: { include: { mediaAssets: true, sourcePosts: true } } },
      where: { id: result.groupId },
    });
    expect(group.items).toHaveLength(4);
    expect(group.items.flatMap((item) => item.sourcePosts)).toHaveLength(4);
    expect(group.items.flatMap((item) => item.mediaAssets)).toHaveLength(4);
    expect(group.items.filter((item) => item.duplicatePrimary)).toHaveLength(1);
  });

  it("searches group alternates and composes tag/action/rating filters safely", async () => {
    await addAdminTag(database, {
      actorUserId: userId,
      contentId: contentIds[0]!,
      label: `Provider comedy ${suffix}`,
    });
    const tag = await database.tag.findFirstOrThrow({
      where: {
        content: { some: { contentItemId: contentIds[0]!, source: "ADMIN" } },
      },
    });
    await database.userAction.create({
      data: { contentItemId: contentIds[0]!, kind: "FAVORITE", userId },
    });
    const services = { database, secret };
    const unicode = await readSearch(
      services,
      userId,
      "https://mirth.test/api/search?q=%E7%AC%91%E9%A1%94",
      { allowHidden: true },
    );
    expect(unicode.items.map((item) => item.id)).toContain(contentIds[0]);
    const filtered = await readSearch(
      services,
      userId,
      `https://mirth.test/api/search?tag=${tag.slug}&favorite=true&mediaKind=image&rating=safe`,
      { allowHidden: true },
    );
    expect(filtered.items.map((item) => item.id)).toEqual([contentIds[0]]);
    await expect(
      readSearch(
        services,
        userId,
        "https://mirth.test/api/search?q=%21%21%21",
        {
          allowHidden: true,
        },
      ),
    ).resolves.toMatchObject({ hasMore: false });
  });

  it("audits an administrator split without deleting any occurrence", async () => {
    await expect(
      splitDuplicateItem(database, {
        actorUserId: userId,
        contentId: contentIds[3]!,
        now: new Date("2026-07-22T20:00:00.000Z"),
      }),
    ).resolves.toEqual({ split: true });
    expect(
      await database.auditEvent.count({
        where: { actorUserId: userId, eventType: "duplicate.manual_split" },
      }),
    ).toBe(1);
    expect(
      await database.sourcePost.count({
        where: { contentItemId: contentIds[3]! },
      }),
    ).toBe(1);
  });
});
