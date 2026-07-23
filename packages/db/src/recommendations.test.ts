import { describe, expect, it } from "vitest";

import {
  diversifyRecommendations,
  recommendationProfileStatus,
  scoreRecommendation,
} from "./recommendations.js";

const weights = {
  favorite: 3,
  freshness: 0.8,
  hide: -4,
  media: 0.5,
  source: 1,
  sourcePriority: 0.25,
  tag: 0.75,
  view: 0.15,
};
const now = new Date("2026-07-23T12:00:00.000Z");
const base = {
  id: "a",
  mediaKind: "IMAGE",
  publishedAt: new Date("2026-07-23T11:00:00.000Z"),
  sourceId: "source-a",
  sourcePriority: 0,
  tagSlugs: ["funny"],
};

describe("local recommendation scoring", () => {
  it("is deterministic, bounded, monotonic, and explainable", () => {
    const neutral = scoreRecommendation(
      base,
      { media: {}, sources: {}, tags: {} },
      weights,
      now,
    );
    const preferred = scoreRecommendation(
      base,
      {
        media: { IMAGE: 1 },
        sources: { "source-a": 10_000 },
        tags: { funny: 2 },
      },
      weights,
      now,
    );
    expect(preferred.score).toBeGreaterThan(neutral.score);
    expect(preferred.score).toBeLessThanOrEqual(20);
    expect(preferred.explanations).toHaveLength(3);
    expect(
      scoreRecommendation(
        base,
        {
          media: { IMAGE: 1 },
          sources: { "source-a": 10_000 },
          tags: { funny: 2 },
        },
        weights,
        now,
      ),
    ).toEqual(preferred);
    const hidden = scoreRecommendation(
      base,
      { media: {}, sources: { "source-a": -2 }, tags: {} },
      weights,
      now,
    );
    expect(hidden.score).toBeLessThan(neutral.score);
  });

  it("limits repeated sources inside a local window when alternatives exist", () => {
    const candidates = ["a", "a", "a", "b"].map((sourceId, index) => ({
      ...base,
      id: String(index),
      sourceId,
    }));
    expect(
      diversifyRecommendations(candidates, 4).map((item) => item.sourceId),
    ).toEqual(["a", "a", "b", "a"]);
  });

  it("selects cold, disabled, stale, and personalized states safely", () => {
    expect(recommendationProfileStatus(null, true, now)).toBe("cold-start");
    expect(recommendationProfileStatus(null, false, now)).toBe("disabled");
    expect(
      recommendationProfileStatus(
        {
          computedAt: new Date("2026-07-20T00:00:00.000Z"),
          explicitActionCount: 2,
        },
        true,
        now,
      ),
    ).toBe("stale");
    expect(
      recommendationProfileStatus(
        { computedAt: now, explicitActionCount: 1 },
        true,
        now,
      ),
    ).toBe("personalized");
  });
});
