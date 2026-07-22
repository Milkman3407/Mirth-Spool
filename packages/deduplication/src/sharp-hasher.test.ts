import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { SharpPerceptualHasher } from "./sharp-hasher";

describe("SharpPerceptualHasher", () => {
  it("decodes one bounded safe raster frame", async () => {
    const png = await sharp({
      create: {
        background: { alpha: 1, b: 40, g: 30, r: 20 },
        channels: 4,
        height: 16,
        width: 16,
      },
    })
      .png()
      .toBuffer();
    const hasher = new SharpPerceptualHasher();
    await expect(
      hasher.hash({
        body: (async function* () {
          yield png;
        })(),
        maxBytes: 10_000,
        maxPixels: 1_000,
        signal: new AbortController().signal,
        timeoutMs: 1_000,
      }),
    ).resolves.toMatchObject({
      hash: "0000000000000000",
      height: 16,
      width: 16,
    });
  });

  it("rejects active SVG even though the decoder supports it", async () => {
    const hasher = new SharpPerceptualHasher();
    await expect(
      hasher.hash({
        body: (async function* () {
          yield Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' />");
        })(),
        maxBytes: 10_000,
        maxPixels: 1_000,
        signal: new AbortController().signal,
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({ code: "HASH_UNSUPPORTED_IMAGE" });
  });
});
