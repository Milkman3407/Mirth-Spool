import { describe, expect, it } from "vitest";

import { prepareRawPayload } from "./raw-payload.js";

describe("raw provider payload policy", () => {
  it("is disabled by default", () => {
    expect(prepareRawPayload({ title: "synthetic" })).toBeNull();
  });

  it("scrubs secret-shaped keys and enforces the byte bound when enabled", () => {
    const prepared = prepareRawPayload(
      {
        authorization: "must-not-survive",
        nested: { title: "synthetic", token: "redacted" },
      },
      { enabled: true, maxBytes: 100 },
    );
    expect(prepared?.value).toEqual({ nested: { title: "synthetic" } });
    expect(() =>
      prepareRawPayload(
        { value: "x".repeat(100) },
        { enabled: true, maxBytes: 20 },
      ),
    ).toThrow(/byte limit/);
  });
});
