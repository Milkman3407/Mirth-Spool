import { describe, expect, it } from "vitest";

import { classifyHttpStatus, safeConnectorFailure } from "./errors.js";

describe("connector error classification", () => {
  it.each([
    [401, "AUTHENTICATION"],
    [403, "AUTHENTICATION"],
    [404, "NOT_FOUND"],
    [429, "RATE_LIMITED"],
    [500, "TRANSIENT"],
    [503, "TRANSIENT"],
    [422, "PERMANENT"],
  ] as const)("classifies HTTP %i as %s", (status, kind) => {
    expect(classifyHttpStatus(status).kind).toBe(kind);
  });

  it("does not expose arbitrary thrown messages", () => {
    expect(
      safeConnectorFailure(new Error("token=private response body")),
    ).toEqual({
      code: "SOURCE_REQUEST_FAILED",
      kind: "TRANSIENT",
      message: "The source is temporarily unavailable.",
    });
  });
});
