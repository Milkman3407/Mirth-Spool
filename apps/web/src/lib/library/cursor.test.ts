import { describe, expect, it } from "vitest";

import { decodeLibraryCursor, encodeLibraryCursor } from "./cursor";

const secret = "unit-test-secret-with-at-least-thirty-two-characters";

describe("library cursors", () => {
  it("round-trips a signed position and rejects tampering", () => {
    const cursor = encodeLibraryCursor(
      {
        i: "00000000-0000-4000-8000-000000000001",
        k: "favorites",
        t: "2026-07-22T00:00:00.000Z",
        v: 1,
      },
      secret,
    );
    expect(decodeLibraryCursor(cursor, secret)).toMatchObject({
      k: "favorites",
    });
    expect(() =>
      decodeLibraryCursor(`${cursor.slice(0, -1)}x`, secret),
    ).toThrow("INVALID_CURSOR");
  });
});
