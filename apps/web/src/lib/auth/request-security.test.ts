import { describe, expect, it } from "vitest";

import { isSameOriginJsonMutation } from "./request-security";

describe("state-changing request protection", () => {
  const origin = "https://mirthspool.invalid";

  it("accepts same-origin JSON and rejects missing or cross-site origins", () => {
    expect(
      isSameOriginJsonMutation(
        new Request(`${origin}/api/setup`, {
          headers: { "content-type": "application/json", origin },
          method: "POST",
        }),
        origin,
      ),
    ).toBe(true);
    expect(
      isSameOriginJsonMutation(
        new Request(`${origin}/api/setup`, {
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
        origin,
      ),
    ).toBe(false);
    expect(
      isSameOriginJsonMutation(
        new Request(`${origin}/api/setup`, {
          headers: {
            "content-type": "application/json",
            origin: "https://attacker.invalid",
            "sec-fetch-site": "cross-site",
          },
          method: "POST",
        }),
        origin,
      ),
    ).toBe(false);
  });
});
