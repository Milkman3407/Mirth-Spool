import { describe, expect, it } from "vitest";

import manifest from "./manifest";

describe("PWA manifest", () => {
  it("is self-contained and has no incoming share target", () => {
    const value = manifest();
    expect(value).toMatchObject({
      display: "standalone",
      id: "/",
      scope: "/",
      start_url: "/",
    });
    expect(value.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sizes: "192x192",
          src: expect.stringMatching(/^\/icons\//),
        }),
        expect.objectContaining({
          sizes: "512x512",
          src: expect.stringMatching(/^\/icons\//),
        }),
      ]),
    );
    expect(value).not.toHaveProperty("share_target");
  });
});
