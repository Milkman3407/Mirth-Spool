import { describe, expect, it } from "vitest";

import {
  contentRandomKey,
  explainHotRanking,
  hotRankingCoordinate,
  prioritySignal,
  providerSignal,
  randomSeedPivot,
} from "./feed-ranking.js";

describe("feed ranking", () => {
  it("bounds provider and source signals", () => {
    expect(providerSignal(0)).toBe(0);
    expect(providerSignal(1_000_000)).toBe(4);
    expect(providerSignal(-1_000_000)).toBe(-4);
    expect(prioritySignal(1_000)).toBe(2);
    expect(prioritySignal(-1_000)).toBe(-2);
  });
  it("produces the documented deterministic explanation", () => {
    const publishedAt = new Date("2026-07-19T12:00:00.000Z");
    const now = new Date("2026-07-22T12:00:00.000Z");
    const coordinate = hotRankingCoordinate({
      providerScore: 9,
      publishedAt,
      sourcePriority: 50,
    });
    expect(explainHotRanking(coordinate, now)).toEqual({
      decayHours: 72,
      formula: "boundedProviderSignal + boundedSourcePriority - ageHours / 72",
      score: 2.302585,
    });
  });
  it("derives stable bounded random keys and pivots", () => {
    expect(contentRandomKey("00000000-0000-4000-8000-000000000001")).toBe(
      contentRandomKey("00000000-0000-4000-8000-000000000001"),
    );
    expect(randomSeedPivot("fixed-seed")).toBe(randomSeedPivot("fixed-seed"));
    expect(randomSeedPivot("fixed-seed")).toBeGreaterThanOrEqual(0);
  });
});
