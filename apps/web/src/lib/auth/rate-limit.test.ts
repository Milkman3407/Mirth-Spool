import { describe, expect, it } from "vitest";

import { createHmac } from "node:crypto";

import {
  consumeRateLimit,
  consumeInvitationAcceptanceLimits,
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

class KeyedFakeStore implements RateLimitStore {
  readonly counts = new Map<string, number>();

  increment(
    key: string,
  ): Promise<{ count: number; retryAfterSeconds: number }> {
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return Promise.resolve({ count, retryAfterSeconds: 900 });
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
    const secret = "proxy-secret-at-least-32-characters";
    expect(getClientAddress(headers, [], secret)).toBe("direct");
    expect(getClientAddress(headers, ["192.0.2.10"], secret)).toBe("direct");
    headers.set("x-mirthspool-forwarded-by", "192.0.2.10");
    expect(getClientAddress(headers, ["192.0.2.10"], secret)).toBe("direct");
    const now = 1_800_000_000_000;
    const timestamp = String(now / 1_000);
    headers.set("x-forwarded-for", "203.0.113.8");
    headers.set("x-mirthspool-forwarded-at", timestamp);
    headers.set(
      "x-mirthspool-forwarded-signature",
      createHmac("sha256", secret)
        .update(`203.0.113.8\n192.0.2.10\n${timestamp}`)
        .digest("base64url"),
    );
    expect(getClientAddress(headers, ["192.0.2.10"], secret, now)).toBe(
      "203.0.113.8",
    );
    expect(
      getClientAddress(headers, ["192.0.2.10"], secret, now + 60_001),
    ).toBe("direct");
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

  it("limits invitation brute force by token digest and address", async () => {
    const store = new KeyedFakeStore();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        await consumeInvitationAcceptanceLimits(store, {
          address: "203.0.113.8",
          secret: "secret",
          tokenHash: "opaque-token-digest",
        }),
      ).toMatchObject({ allowed: true });
    }
    expect(
      await consumeInvitationAcceptanceLimits(store, {
        address: "203.0.113.8",
        secret: "secret",
        tokenHash: "opaque-token-digest",
      }),
    ).toEqual({ allowed: false, retryAfterSeconds: 900 });
  });
});
