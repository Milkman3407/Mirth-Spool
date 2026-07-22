import { createHash, type Hash } from "node:crypto";

import { MediaCacheError } from "./errors.js";

const allowedMimeTypes = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
]);

export class MediaStreamVerifier {
  readonly #declaredMimeType: string | null;
  readonly #expectedKind: "ANIMATED_IMAGE" | "IMAGE" | "VIDEO";
  readonly #hash: Hash = createHash("sha256");
  #actualMimeType: string | null = null;
  #byteLength = 0;

  constructor(input: {
    readonly declaredMimeType: string | null;
    readonly expectedKind: "ANIMATED_IMAGE" | "IMAGE" | "VIDEO";
  }) {
    this.#declaredMimeType = input.declaredMimeType;
    this.#expectedKind = input.expectedKind;
  }

  async *verify(source: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
    const pending: Uint8Array[] = [];
    let prefix = Buffer.alloc(0);
    const iterator = source[Symbol.asyncIterator]();
    while (prefix.byteLength < 16) {
      const next = await iterator.next();
      if (next.done) break;
      const chunk = next.value;
      pending.push(chunk);
      prefix = Buffer.concat([prefix, chunk]).subarray(0, 64);
    }
    if (prefix.byteLength === 0) {
      throw new MediaCacheError("MEDIA_CONTENT_TYPE_UNSUPPORTED");
    }
    this.#actualMimeType = detectMimeType(prefix);
    this.#assertMimeType();
    for (const chunk of pending) {
      this.#record(chunk);
      yield chunk;
    }
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      const chunk = next.value;
      this.#record(chunk);
      yield chunk;
    }
  }

  result(): {
    readonly byteLength: number;
    readonly mimeType: string;
    readonly sha256: string;
  } {
    if (!this.#actualMimeType) {
      throw new MediaCacheError("MEDIA_CONTENT_TYPE_UNSUPPORTED");
    }
    return Object.freeze({
      byteLength: this.#byteLength,
      mimeType: this.#actualMimeType,
      sha256: this.#hash.digest("hex"),
    });
  }

  #assertMimeType(): void {
    const actual = this.#actualMimeType;
    if (!actual || !allowedMimeTypes.has(actual)) {
      throw new MediaCacheError(
        looksActiveContent(actual)
          ? "MEDIA_ACTIVE_CONTENT"
          : "MEDIA_CONTENT_TYPE_UNSUPPORTED",
      );
    }
    const expectedPrefix = this.#expectedKind === "VIDEO" ? "video/" : "image/";
    if (!actual.startsWith(expectedPrefix)) {
      throw new MediaCacheError("MEDIA_CONTENT_TYPE_MISMATCH");
    }
    const declared = this.#declaredMimeType;
    if (
      declared &&
      declared !== "application/octet-stream" &&
      declared !== actual
    ) {
      throw new MediaCacheError("MEDIA_CONTENT_TYPE_MISMATCH");
    }
  }

  #record(chunk: Uint8Array): void {
    this.#byteLength += chunk.byteLength;
    this.#hash.update(chunk);
  }
}

export function detectMimeType(bytes: Uint8Array): string | null {
  const value = Buffer.from(bytes);
  const text = value.subarray(0, 64).toString("utf8").trimStart().toLowerCase();
  if (
    text.startsWith("<svg") ||
    text.startsWith("<!doctype") ||
    text.startsWith("<html")
  ) {
    return "text/html";
  }
  if (
    value.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff)
    return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(value.subarray(0, 6).toString("ascii")))
    return "image/gif";
  if (
    value.subarray(0, 4).toString("ascii") === "RIFF" &&
    value.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "image/webp";
  if (value.subarray(4, 8).toString("ascii") === "ftyp") return "video/mp4";
  if (value.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
    return "video/webm";
  return null;
}

function looksActiveContent(mimeType: string | null): boolean {
  return mimeType === "text/html" || mimeType === "image/svg+xml";
}
