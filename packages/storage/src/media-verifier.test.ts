import { describe, expect, it } from "vitest";

import { MediaStreamVerifier, detectMimeType } from "./media-verifier.js";

async function consume(verifier: MediaStreamVerifier, bytes: Uint8Array) {
  for await (const _chunk of verifier.verify(
    (async function* () {
      yield bytes.subarray(0, 4);
      yield bytes.subarray(4);
    })(),
  )) {
    // Consumption drives validation and hashing.
    void _chunk;
  }
  return verifier.result();
}

describe("media stream verifier", () => {
  it("uses magic bytes and hashes the complete stream", async () => {
    const png = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      Buffer.alloc(16, 1),
    ]);
    const result = await consume(
      new MediaStreamVerifier({
        declaredMimeType: "image/png",
        expectedKind: "IMAGE",
      }),
      png,
    );
    expect(result.mimeType).toBe("image/png");
    expect(result.byteLength).toBe(png.byteLength);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("rejects HTML, SVG, and declared MIME mismatches", async () => {
    for (const active of [
      "<html><body>x",
      "<svg xmlns='http://www.w3.org/2000/svg'>",
    ]) {
      await expect(
        consume(
          new MediaStreamVerifier({
            declaredMimeType: "image/png",
            expectedKind: "IMAGE",
          }),
          Buffer.from(active),
        ),
      ).rejects.toMatchObject({ code: "MEDIA_ACTIVE_CONTENT" });
    }
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(20),
    ]);
    await expect(
      consume(
        new MediaStreamVerifier({
          declaredMimeType: "image/png",
          expectedKind: "IMAGE",
        }),
        jpeg,
      ),
    ).rejects.toMatchObject({ code: "MEDIA_CONTENT_TYPE_MISMATCH" });
    expect(detectMimeType(Buffer.from("not media"))).toBeNull();
  });
});
