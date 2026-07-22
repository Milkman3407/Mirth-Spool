import { describe, expect, it } from "vitest";

import { parseByteRange } from "./cache-service";

describe("cached media ranges", () => {
  it("parses bounded explicit, open-ended, and suffix ranges", () => {
    expect(parseByteRange("bytes=2-4", 10)).toEqual({ start: 2, end: 4 });
    expect(parseByteRange("bytes=7-", 10)).toEqual({ start: 7, end: 9 });
    expect(parseByteRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
  });

  it("rejects multiple, reversed, empty, and out-of-bounds ranges", () => {
    for (const value of [
      "bytes=0-1,3-4",
      "bytes=4-2",
      "bytes=-",
      "bytes=10-12",
    ]) {
      expect(parseByteRange(value, 10)).toBeNull();
    }
  });
});
