import { describe, expect, it } from "vitest";

import {
  canonicalUrlHash,
  normalizeCanonicalUrl,
  normalizeTag,
} from "./normalization";

describe("duplicate normalization", () => {
  it("removes fragments and known tracking while preserving semantic query state", () => {
    expect(
      normalizeCanonicalUrl(
        "HTTPS://Example.test:443/post?utm_source=feed&page=2&sort=new#reply",
      ),
    ).toBe("https://example.test/post?page=2&sort=new");
    expect(canonicalUrlHash("https://example.test/post?page=2")).not.toBe(
      canonicalUrlHash("https://example.test/post?page=3"),
    );
    expect(normalizeCanonicalUrl("https://www.example.test/post")).not.toBe(
      normalizeCanonicalUrl("https://example.test/post"),
    );
  });

  it("normalizes bounded Unicode provider tags", () => {
    expect(normalizeTag(" #Reaction_Image ")).toBe("reaction-image");
    expect(normalizeTag("#猫ミーム")).toBe("猫ミーム");
    expect(normalizeTag("!!!")).toBeNull();
  });
});
