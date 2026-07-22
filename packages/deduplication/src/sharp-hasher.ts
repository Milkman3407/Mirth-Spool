import sharp from "sharp";
import { z } from "zod";

import {
  differenceHash,
  type PerceptualHasher,
  type PerceptualHashInput,
  type PerceptualHashResult,
} from "./perceptual-hash.js";

const safeFormats = new Set(["jpeg", "png", "webp"]);

export class PerceptualHashError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "PerceptualHashError";
  }
}

export class SharpPerceptualHasher implements PerceptualHasher {
  async hash(input: PerceptualHashInput): Promise<PerceptualHashResult> {
    const maxBytes = z
      .number()
      .int()
      .min(1_024)
      .max(50_000_000)
      .parse(input.maxBytes);
    const maxPixels = z
      .number()
      .int()
      .min(81)
      .max(100_000_000)
      .parse(input.maxPixels);
    const timeoutMs = z
      .number()
      .int()
      .min(100)
      .max(30_000)
      .parse(input.timeoutMs);
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of input.body) {
      if (input.signal.aborted) throw new PerceptualHashError("HASH_CANCELLED");
      bytes += chunk.byteLength;
      if (bytes > maxBytes)
        throw new PerceptualHashError("HASH_INPUT_TOO_LARGE");
      chunks.push(Buffer.from(chunk));
    }
    if (bytes === 0) throw new PerceptualHashError("HASH_INPUT_EMPTY");
    const buffer = Buffer.concat(chunks, bytes);
    const prefix = buffer.subarray(0, 512).toString("utf8");
    if (/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/iu.test(prefix)) {
      throw new PerceptualHashError("HASH_UNSUPPORTED_IMAGE");
    }
    try {
      const image = sharp(buffer, {
        animated: false,
        failOn: "warning",
        limitInputChannels: 4,
        limitInputPixels: maxPixels,
        pages: 1,
        sequentialRead: true,
      });
      const metadata = await image.metadata();
      if (
        !metadata.format ||
        !safeFormats.has(metadata.format) ||
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height > maxPixels
      ) {
        throw new PerceptualHashError("HASH_UNSUPPORTED_IMAGE");
      }
      const pixels = await image
        .clone()
        .resize(9, 8, { fit: "fill", kernel: "nearest" })
        .greyscale()
        .raw()
        .timeout({ seconds: Math.max(1, Math.ceil(timeoutMs / 1_000)) })
        .toBuffer();
      if (input.signal.aborted) throw new PerceptualHashError("HASH_CANCELLED");
      return Object.freeze({
        hash: differenceHash(pixels),
        height: metadata.height,
        width: metadata.width,
      });
    } catch (error) {
      if (error instanceof PerceptualHashError) throw error;
      throw new PerceptualHashError(
        error instanceof Error && error.message.includes("timeout")
          ? "HASH_TIMEOUT"
          : "HASH_DECODE_FAILED",
      );
    }
  }
}
