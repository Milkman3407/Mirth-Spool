import { randomUUID } from "node:crypto";

import { RedisOAuthTokenCache } from "@mirthspool/redis";
import { describe, expect, it } from "vitest";

const redisUrl = "redis://127.0.0.1:56379";

describe("Reddit OAuth token cache", () => {
  it("shares hits, expires values, refreshes, and prevents a refresh stampede", async () => {
    const cache = new RedisOAuthTokenCache({
      prefix: `mirthspool:test:oauth:${randomUUID()}:`,
      url: redisUrl,
    });
    const key = "a".repeat(64);
    let acquisitions = 0;
    const acquire = async () => {
      acquisitions += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        accessToken: `synthetic-token-${acquisitions}`,
        expiresAt: new Date(Date.now() + 31_500).toISOString(),
      };
    };

    const concurrent = await Promise.all(
      Array.from({ length: 8 }, () => cache.getOrCreate(key, acquire)),
    );
    expect(acquisitions).toBe(1);
    expect(new Set(concurrent.map((token) => token.accessToken))).toEqual(
      new Set(["synthetic-token-1"]),
    );

    const hit = await cache.getOrCreate(key, acquire);
    expect(hit.accessToken).toBe("synthetic-token-1");
    expect(acquisitions).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 1_600));
    const refreshed = await cache.getOrCreate(key, async () => ({
      accessToken: `synthetic-token-${++acquisitions}`,
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    }));
    expect(refreshed.accessToken).toBe("synthetic-token-2");
    expect(acquisitions).toBe(2);
  });
});
