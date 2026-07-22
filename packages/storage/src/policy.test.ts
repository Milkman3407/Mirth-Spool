import { describe, expect, it } from "vitest";

import { selectEvictions, shouldCacheMedia } from "./policy.js";

const policy = {
  allowedKinds: ["IMAGE", "VIDEO"] as const,
  maxObjectBytes: 100,
  policy: "FAVORITES_ONLY" as const,
  quotaBytes: 1_000,
  ttlSeconds: 60,
};

describe("media cache policy", () => {
  it("defaults decisions to explicit policy and allowed media kinds", () => {
    expect(shouldCacheMedia({ favorite: true, kind: "IMAGE", policy })).toBe(
      true,
    );
    expect(shouldCacheMedia({ favorite: false, kind: "IMAGE", policy })).toBe(
      false,
    );
    expect(shouldCacheMedia({ favorite: true, kind: "LINK", policy })).toBe(
      false,
    );
    expect(
      shouldCacheMedia({
        favorite: true,
        kind: "IMAGE",
        policy: { ...policy, policy: "NONE" },
      }),
    ).toBe(false);
  });

  it("evicts expired and least-recently-used objects without evicting favorites", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    const candidates = [
      {
        id: "favorite",
        favorite: true,
        size: 50,
        cachedAt: now,
        lastAccessedAt: now,
        cacheExpiresAt: null,
      },
      {
        id: "recent",
        favorite: false,
        size: 50,
        cachedAt: now,
        lastAccessedAt: now,
        cacheExpiresAt: null,
      },
      {
        id: "expired",
        favorite: false,
        size: 50,
        cachedAt: now,
        lastAccessedAt: null,
        cacheExpiresAt: new Date(0),
      },
    ];
    expect(
      selectEvictions(candidates, {
        bytesNeeded: 75,
        now,
        policy: "FAVORITES_ONLY",
      }).map(({ id }) => id),
    ).toEqual(["expired", "recent"]);
    expect(
      selectEvictions(candidates, {
        bytesNeeded: 125,
        now,
        policy: "FAVORITES_ONLY",
      }),
    ).toEqual([]);
  });
});
