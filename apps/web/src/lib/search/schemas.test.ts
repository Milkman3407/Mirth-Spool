import { describe, expect, it } from "vitest";

import { parseSearchQuery } from "./schemas";

describe("search query parsing", () => {
  it("normalizes Unicode text and preserves composable filters", () => {
    const parsed = parseSearchQuery(
      "https://mirth.test/api/search?q=%EF%BC%ADirth+%F0%9F%98%82&mediaKind=image&tag=unicode&favorite=true",
    );
    expect(parsed).toMatchObject({
      favorite: true,
      kinds: ["IMAGE"],
      queryText: "Mirth 😂",
      tags: ["unicode"],
    });
  });

  it("treats punctuation-only text as an empty query", () => {
    expect(
      parseSearchQuery("https://mirth.test/api/search?q=%21%21%21").queryText,
    ).toBeUndefined();
  });

  it.each([
    `q=${"x".repeat(201)}`,
    `q=${Array.from({ length: 21 }, (_, index) => `word${index}`).join("+")}`,
    "q=test&q=again",
    "sourceId=not-a-uuid",
    "tag=x%27%29%3BDELETE+FROM+ContentItem--",
    "unknown=true",
  ])("rejects bounded or suspicious input: %s", (query) => {
    expect(() =>
      parseSearchQuery(`https://mirth.test/api/search?${query}`),
    ).toThrow();
  });
});
