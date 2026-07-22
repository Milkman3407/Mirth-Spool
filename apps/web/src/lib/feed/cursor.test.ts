import { describe, expect, it } from "vitest";

import { decodeFeedCursor, encodeFeedCursor } from "./cursor";

const secret = "unit-test-secret-at-least-thirty-two-characters";
const payload = {
  f: "a".repeat(64),
  i: "00000000-0000-4000-8000-000000000001",
  m: "new" as const,
  p: "2026-07-22T12:00:00.000Z",
  v: 1 as const,
};

describe("feed cursors", () => {
  it("round-trips a versioned payload", () =>
    expect(decodeFeedCursor(encodeFeedCursor(payload, secret), secret)).toEqual(
      payload,
    ));
  it("rejects tampering and another signing key", () => {
    const encoded = encodeFeedCursor(payload, secret);
    expect(() => decodeFeedCursor(`${encoded.slice(0, -1)}x`, secret)).toThrow(
      "INVALID_CURSOR",
    );
    expect(() => decodeFeedCursor(encoded, `${secret}-different`)).toThrow(
      "INVALID_CURSOR",
    );
  });
  it("rejects unsupported versions and oversized input", () => {
    const invalid = encodeFeedCursor({ ...payload, v: 2 } as never, secret);
    expect(() => decodeFeedCursor(invalid, secret)).toThrow("INVALID_CURSOR");
    expect(() => decodeFeedCursor("x".repeat(2_049), secret)).toThrow(
      "INVALID_CURSOR",
    );
  });
});
