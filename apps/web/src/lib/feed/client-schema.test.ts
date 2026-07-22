import { describe, expect, it } from "vitest";

import { feedPageSchema } from "./client-schema";

describe("feed client response schema", () => {
  it("accepts serialized byte lengths and rejects executable URL schemes", () => {
    const base = {
      hasMore: false,
      items: [
        {
          actionState: {
            favorite: false,
            hidden: false,
            viewed: false,
            view: null,
          },
          alternateSourceCount: 0,
          authorName: null,
          contentRating: "SAFE",
          contentWarning: null,
          id: "00000000-0000-4000-8000-000000000001",
          media: {
            altText: null,
            byteLength: "128",
            durationMs: null,
            height: 1,
            id: "00000000-0000-4000-8000-000000000002",
            kind: "IMAGE",
            mimeType: "image/png",
            remoteUrl: "https://media.example.test/image.png",
            renderUrl: "https://media.example.test/image.png",
            cacheState: "REMOTE_ONLY",
            width: 1,
          },
          primarySource: null,
          publishedAt: "2026-07-22T00:00:00.000Z",
          summary: null,
          title: "Fixture",
        },
      ],
      nextCursor: null,
    };
    expect(feedPageSchema.parse(base).items[0]?.media?.byteLength).toBe("128");
    expect(
      feedPageSchema.safeParse({
        ...base,
        items: [
          {
            ...base.items[0],
            media: {
              ...base.items[0]!.media,
              cacheState: "CACHED",
              renderUrl: "/api/media/00000000-0000-4000-8000-000000000002",
            },
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      feedPageSchema.safeParse({
        ...base,
        items: [
          {
            ...base.items[0],
            media: {
              ...base.items[0]!.media,
              remoteUrl: "javascript:alert(1)",
              renderUrl: "javascript:alert(1)",
              cacheState: "REMOTE_ONLY",
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
});
