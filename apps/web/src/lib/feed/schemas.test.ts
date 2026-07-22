import { describe, expect, it } from "vitest";

import { parseFeedQuery } from "./schemas";

describe("feed query validation", () => {
  it("parses bounded repeatable filters", () => {
    const result = parseFeedQuery(
      "http://localhost/api/feed?mode=hot&limit=50&sourceId=00000000-0000-4000-8000-000000000001&mediaKind=image&tag=funny-cats&rating=sensitive",
    );
    expect(result).toMatchObject({
      kinds: ["IMAGE"],
      limit: 50,
      mode: "hot",
      rating: "sensitive",
      tags: ["funny-cats"],
    });
  });
  it("rejects unknown, oversized, and contradictory input", () => {
    expect(() => parseFeedQuery("http://localhost/api/feed?wat=1")).toThrow();
    expect(() =>
      parseFeedQuery("http://localhost/api/feed?limit=51"),
    ).toThrow();
    expect(() =>
      parseFeedQuery("http://localhost/api/feed?mode=new&seed=x"),
    ).toThrow();
    expect(() =>
      parseFeedQuery(
        "http://localhost/api/feed?from=2026-07-23T00:00:00Z&to=2026-07-22T00:00:00Z",
      ),
    ).toThrow();
  });
});
