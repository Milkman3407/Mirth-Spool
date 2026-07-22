import { describe, expect, it } from "vitest";

import {
  connectorPageSchema,
  connectivityResultSchema,
  normalizedSourcePostSchema,
} from "./schemas.js";

describe("provider-independent connector schemas", () => {
  it("normalizes a bounded post and page", () => {
    const post = normalizedSourcePostSchema.parse({
      externalId: "opaque-id",
      originalUrl: "https://example.com/post/opaque-id",
      providerCreatedAt: "2026-01-02T03:04:05.000Z",
    });
    expect(post).toMatchObject({
      categories: [],
      contentRating: "UNKNOWN",
      media: [],
    });
    expect(
      connectorPageSchema.parse({
        hasMore: false,
        nextCheckpoint: null,
        posts: [post],
      }),
    ).toMatchObject({ hasMore: false, posts: [post] });
  });

  it("rejects oversized pages and unsafe result details", () => {
    expect(() =>
      connectorPageSchema.parse({
        hasMore: false,
        nextCheckpoint: null,
        posts: Array.from({ length: 201 }, (_, index) => ({
          externalId: String(index),
          originalUrl: `https://example.com/${index}`,
          providerCreatedAt: "2026-01-02T03:04:05.000Z",
        })),
      }),
    ).toThrow();
    expect(() =>
      connectivityResultSchema.parse({
        details: { responseBody: "x".repeat(501) },
        message: "Connected",
        ok: true,
      }),
    ).toThrow();
  });
});
