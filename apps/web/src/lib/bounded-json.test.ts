import { describe, expect, it } from "vitest";

import {
  AUTH_JSON_MAX_BYTES,
  readBoundedJson,
  RequestTooLargeError,
} from "./bounded-json";

describe("bounded JSON parsing", () => {
  it("accepts an exact-size chunked body", async () => {
    const body = JSON.stringify({
      value: "x".repeat(AUTH_JSON_MAX_BYTES - 12),
    });
    expect(new TextEncoder().encode(body)).toHaveLength(AUTH_JSON_MAX_BYTES);
    const bytes = new TextEncoder().encode(body);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 100));
        controller.enqueue(bytes.slice(100));
        controller.close();
      },
    });
    await expect(
      readBoundedJson(
        new Request("https://example.invalid", {
          body: stream,
          duplex: "half",
          method: "POST",
        } as RequestInit),
        AUTH_JSON_MAX_BYTES,
      ),
    ).resolves.toEqual({ value: "x".repeat(AUTH_JSON_MAX_BYTES - 12) });
  });

  it("rejects oversized declared and chunked bodies", async () => {
    await expect(
      readBoundedJson(
        new Request("https://example.invalid", {
          body: "{}",
          headers: { "content-length": String(AUTH_JSON_MAX_BYTES + 1) },
          method: "POST",
        }),
        AUTH_JSON_MAX_BYTES,
      ),
    ).rejects.toBeInstanceOf(RequestTooLargeError);

    const body = `"${"x".repeat(AUTH_JSON_MAX_BYTES)}"`;
    await expect(
      readBoundedJson(
        new Request("https://example.invalid", { body, method: "POST" }),
        AUTH_JSON_MAX_BYTES,
      ),
    ).rejects.toBeInstanceOf(RequestTooLargeError);
  });

  it("rejects malformed JSON and malformed UTF-8", async () => {
    await expect(
      readBoundedJson(
        new Request("https://example.invalid", {
          body: "{",
          method: "POST",
        }),
        AUTH_JSON_MAX_BYTES,
      ),
    ).rejects.toBeInstanceOf(SyntaxError);
    await expect(
      readBoundedJson(
        new Request("https://example.invalid", {
          body: new Uint8Array([0xc3, 0x28]),
          method: "POST",
        }),
        AUTH_JSON_MAX_BYTES,
      ),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
