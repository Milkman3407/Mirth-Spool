import { gzipSync } from "node:zlib";

import type {
  HttpTransport,
  ResolvedTransportRequest,
  TransportResponse,
} from "@mirthspool/connectors";
import { describe, expect, it } from "vitest";

import { HardenedMediaClient } from "./media-client.js";

function response(
  status: number,
  headers: Readonly<Record<string, string>>,
  bytes = Buffer.alloc(0),
): TransportResponse {
  return {
    body: (async function* () {
      yield bytes;
    })(),
    cancel() {},
    headers,
    status,
  };
}

class SequenceTransport implements HttpTransport {
  readonly requests: ResolvedTransportRequest[] = [];
  constructor(private readonly responses: TransportResponse[]) {}
  async request(input: ResolvedTransportRequest) {
    this.requests.push(input);
    return this.responses.shift()!;
  }
}

const publicResolver = {
  resolve: async (hostname: string) => [
    {
      address: hostname === "private.test" ? "127.0.0.1" : "93.184.216.34",
      family: 4 as const,
    },
  ],
};

async function collect(body: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

describe("hardened media client", () => {
  it("revalidates redirect targets and blocks public-to-private redirects", async () => {
    const transport = new SequenceTransport([
      response(302, { location: "http://private.test/image.png" }),
    ]);
    const client = new HardenedMediaClient({
      resolver: publicResolver,
      transport,
    });
    await expect(
      client.download(
        { maxBytes: 100, url: "https://public.test/image.png" },
        async () => undefined,
      ),
    ).rejects.toMatchObject({ code: "MEDIA_ADDRESS_REJECTED" });
    expect(transport.requests).toHaveLength(1);
  });

  it("rejects disallowed ports and oversized declared bodies", async () => {
    const client = new HardenedMediaClient({
      resolver: publicResolver,
      transport: new SequenceTransport([
        response(200, { "content-length": "101", "content-type": "image/png" }),
      ]),
    });
    await expect(
      client.download(
        { maxBytes: 100, url: "https://public.test:8443/image.png" },
        async () => undefined,
      ),
    ).rejects.toMatchObject({ code: "MEDIA_URL_REJECTED" });
    await expect(
      client.download(
        { maxBytes: 100, url: "https://public.test/image.png" },
        async () => undefined,
      ),
    ).rejects.toMatchObject({ code: "MEDIA_RESPONSE_TOO_LARGE" });
  });

  it("bounds decompressed bodies and rejects active content headers", async () => {
    const compressed = gzipSync(Buffer.alloc(512, 1));
    const client = new HardenedMediaClient({
      limits: { maxCompressedBytes: 1_000, maxDecompressedBytes: 100 },
      resolver: publicResolver,
      transport: new SequenceTransport([
        response(
          200,
          { "content-encoding": "gzip", "content-type": "image/png" },
          compressed,
        ),
        response(200, { "content-type": "text/html" }, Buffer.from("<html>")),
      ]),
    });
    await expect(
      client.download(
        { maxBytes: 1_000, url: "https://public.test/a" },
        ({ body }) => collect(body),
      ),
    ).rejects.toMatchObject({ code: "MEDIA_RESPONSE_TOO_LARGE" });
    await expect(
      client.download(
        { maxBytes: 1_000, url: "https://public.test/b" },
        ({ body }) => collect(body),
      ),
    ).rejects.toMatchObject({ code: "MEDIA_ACTIVE_CONTENT" });
  });

  it("cancels a stalled response at the total deadline", async () => {
    const transport: HttpTransport = {
      request: async (input) => ({
        body: {
          [Symbol.asyncIterator]() {
            return {
              async next(): Promise<IteratorResult<Uint8Array>> {
                while (!input.signal.aborted) {
                  await new Promise((resolve) => setTimeout(resolve, 5));
                }
                throw input.signal.reason;
              },
            };
          },
        },
        cancel() {},
        headers: { "content-type": "image/png" },
        status: 200,
      }),
    };
    const client = new HardenedMediaClient({
      limits: { totalTimeoutMs: 20 },
      resolver: publicResolver,
      transport,
    });
    await expect(
      client.download(
        { maxBytes: 100, url: "https://public.test/stalled" },
        ({ body }) => collect(body),
      ),
    ).rejects.toMatchObject({ code: "MEDIA_RESPONSE_TIMEOUT" });
  });
});
