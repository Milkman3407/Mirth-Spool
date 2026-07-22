import { describe, expect, it } from "vitest";

import {
  consumeRateLimit,
  getClientAddress,
  hashRateLimitSubject,
  type RateLimitStore,
} from "./rate-limit";

class FakeStore implements RateLimitStore {
  count = 0;

  increment(): Promise<{ count: number; retryAfterSeconds: number }> {
    this.count += 1;
    return Promise.resolve({ count: this.count, retryAfterSeconds: 60 });
  }
}

describe("authentication rate limiting", () => {
  it("blocks after the bounded attempt count", async () => {
    const store = new FakeStore();
    expect(
      await consumeRateLimit(store, {
        key: "key",
        limit: 2,
        windowSeconds: 60,
      }),
    ).toMatchObject({ allowed: true, count: 1 });
    await consumeRateLimit(store, { key: "key", limit: 2, windowSeconds: 60 });
    expect(
      await consumeRateLimit(store, {
        key: "key",
        limit: 2,
        windowSeconds: 60,
      }),
    ).toMatchObject({ allowed: false, count: 3, retryAfterSeconds: 60 });
  });

  it("uses proxy addresses only when explicitly trusted", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.8, 10.0.0.1" });
    expect(getClientAddress(headers, false)).toBe("direct");
    expect(getClientAddress(headers, true)).toBe("203.0.113.8");
  });

  it("produces opaque stable subjects", () => {
    const result = hashRateLimitSubject(
      "secret",
      "login",
      "admin@example.invalid",
    );
    expect(result).toBe(
      hashRateLimitSubject("secret", "login", "admin@example.invalid"),
    );
    expect(result).not.toContain("admin");
  });
});
