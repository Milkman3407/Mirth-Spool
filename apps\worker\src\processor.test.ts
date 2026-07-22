import { describe, expect, it } from "vitest";

import {
  RetryableIngestionError,
  retryDelayMilliseconds,
  sourceBackoffStrategy,
} from "./processor.js";

describe("ingestion retry policy", () => {
  it("honors provider rate-limit delays", () => {
    const error = new RetryableIngestionError("SOURCE_RATE_LIMITED", 42_000);
    expect(sourceBackoffStrategy(2, "source-exponential", error)).toBe(42_000);
    expect(retryDelayMilliseconds("source-a", 2, 42)).toBe(42_000);
  });

  it("uses bounded deterministic exponential backoff with jitter", () => {
    expect(retryDelayMilliseconds("source-a", 3)).toBe(
      retryDelayMilliseconds("source-a", 3),
    );
    expect(retryDelayMilliseconds("source-a", 99)).toBeLessThanOrEqual(301_000);
  });
});
