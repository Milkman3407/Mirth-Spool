import { describe, expect, it } from "vitest";

import {
  HardenedHttpClient,
  type AddressResolver,
  type HttpTransport,
  type ResolvedTransportRequest,
  type TimerScheduler,
  type TransportResponse,
} from "./http-client.js";

const logger = Object.freeze({
  debug() {},
  error() {},
  info() {},
  warn() {},
});

const publicResolver: AddressResolver = {
  resolve: async () => [{ address: "1.1.1.1", family: 4 }],
};

function response(
  status: number,
  headers: Readonly<Record<string, string>>,
  chunks: readonly Uint8Array[] = [],
): TransportResponse {
  return {
    body: (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
    cancel() {},
    headers,
    status,
  };
}

class QueueTransport implements HttpTransport {
  readonly requests: ResolvedTransportRequest[] = [];
  constructor(readonly responses: TransportResponse[]) {}
  async request(input: ResolvedTransportRequest): Promise<TransportResponse> {
    this.requests.push(input);
    const next = this.responses.shift();
    if (!next) throw new Error("unexpected request");
    return next;
  }
}

describe("hardened HTTP client", () => {
  it("re-resolves every redirect and blocks a public-to-private hop", async () => {
    const resolver: AddressResolver = {
      resolve: async (hostname) =>
        hostname === "public.example"
          ? [{ address: "1.1.1.1", family: 4 }]
          : [{ address: "127.0.0.1", family: 4 }],
    };
    const transport = new QueueTransport([
      response(302, { location: "http://private.example/metadata" }),
    ]);
    const client = new HardenedHttpClient({ logger, resolver, transport });
    await expect(
      client.request({ url: "https://public.example/start" }),
    ).rejects.toMatchObject({
      code: "SOURCE_ADDRESS_REJECTED",
    });
    expect(transport.requests).toHaveLength(1);
  });

  it("maps resolver failures to a stable safe code", async () => {
    const client = new HardenedHttpClient({
      logger,
      resolver: {
        resolve: async () => Promise.reject(new Error("dns details")),
      },
      transport: new QueueTransport([]),
    });

    await expect(
      client.request({ url: "https://missing.example/feed" }),
    ).rejects.toMatchObject({
      code: "SOURCE_DNS_FAILED",
      message: "The source is temporarily unavailable.",
    });
  });

  it("strips credentials on a cross-origin redirect", async () => {
    const transport = new QueueTransport([
      response(302, { location: "https://next.example/final" }),
      response(200, { "content-type": "application/json" }, [
        Buffer.from("{}"),
      ]),
    ]);
    const client = new HardenedHttpClient({
      logger,
      resolver: publicResolver,
      transport,
    });
    await client.request({
      expectedContentTypes: ["application/json"],
      headers: { authorization: "Bearer private", cookie: "session=private" },
      url: "https://first.example/start",
    });
    expect(transport.requests[0]?.headers.authorization).toBe("Bearer private");
    expect(transport.requests[1]?.headers).not.toHaveProperty("authorization");
    expect(transport.requests[1]?.headers).not.toHaveProperty("cookie");
  });

  it("enforces compressed/decompressed byte and content-type limits", async () => {
    const oversized = new HardenedHttpClient({
      limits: { maxCompressedBytes: 3, maxDecompressedBytes: 3 },
      logger,
      resolver: publicResolver,
      transport: new QueueTransport([
        response(200, { "content-type": "application/json" }, [
          Buffer.from("four"),
        ]),
      ]),
    });
    await expect(
      oversized.request({
        expectedContentTypes: ["application/json"],
        url: "https://example.com",
      }),
    ).rejects.toMatchObject({ code: "SOURCE_RESPONSE_TOO_LARGE" });

    const wrongType = new HardenedHttpClient({
      logger,
      resolver: publicResolver,
      transport: new QueueTransport([
        response(200, { "content-type": "text/html" }),
      ]),
    });
    await expect(
      wrongType.request({
        expectedContentTypes: ["application/json"],
        url: "https://example.com",
      }),
    ).rejects.toMatchObject({ code: "SOURCE_CONTENT_TYPE_UNSUPPORTED" });
  });

  it("allows explicitly accepted 304 responses without requiring content type", async () => {
    const client = new HardenedHttpClient({
      logger,
      resolver: publicResolver,
      transport: new QueueTransport([response(304, {})]),
    });
    await expect(
      client.request({
        acceptedStatuses: [304],
        expectedContentTypes: ["application/rss+xml"],
        url: "https://example.com/feed",
      }),
    ).resolves.toMatchObject({ status: 304 });
  });

  it("accepts a standards-compatible abort signal from another runtime realm", async () => {
    const compatibleSignal = new EventTarget();
    Object.defineProperties(compatibleSignal, {
      aborted: { value: false },
      reason: { value: undefined },
    });
    const client = new HardenedHttpClient({
      logger,
      resolver: publicResolver,
      transport: new QueueTransport([
        response(200, { "content-type": "application/rss+xml" }, [
          Buffer.from("<rss />"),
        ]),
      ]),
    });

    await expect(
      client.request({
        expectedContentTypes: ["application/rss+xml"],
        signal: compatibleSignal as AbortSignal,
        url: "https://example.com/feed",
      }),
    ).resolves.toMatchObject({ status: 200 });
  });

  it("uses an injectable total-timeout boundary", async () => {
    let fire: (() => void) | undefined;
    const timer: TimerScheduler = {
      clear() {},
      set(callback) {
        fire = callback;
        return 1;
      },
    };
    const transport: HttpTransport = {
      request: (input) =>
        new Promise((_, reject) =>
          input.signal.addEventListener(
            "abort",
            () => reject(input.signal.reason),
            {
              once: true,
            },
          ),
        ),
    };
    const client = new HardenedHttpClient({
      logger,
      resolver: publicResolver,
      timer,
      transport,
    });
    const pending = client.request({ url: "https://example.com" });
    await Promise.resolve();
    fire?.();
    await expect(pending).rejects.toMatchObject({
      code: "SOURCE_REQUEST_TIMEOUT",
    });
  });
});
