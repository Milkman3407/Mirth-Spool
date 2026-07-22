import { lookup } from "node:dns/promises";
import { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

import {
  assertAddressPolicy,
  NodeHttpTransport,
  validateOutboundUrl,
  type HttpClientLimits,
  type HttpTransport,
  type ResolvedAddress,
  type TransportResponse,
} from "@mirthspool/connectors";

import { MediaCacheError } from "./errors.js";

export interface MediaAddressResolver {
  resolve(hostname: string): Promise<readonly ResolvedAddress[]>;
}

export interface MediaDownloadResponse {
  readonly body: AsyncIterable<Uint8Array>;
  readonly declaredMimeType: string | null;
  readonly finalUrl: string;
}

export interface HardenedMediaClientOptions {
  readonly allowPrivateAddresses?: boolean;
  readonly allowedPorts?: readonly number[];
  readonly limits?: Partial<HttpClientLimits>;
  readonly resolver?: MediaAddressResolver;
  readonly transport?: HttpTransport;
  readonly userAgent?: string;
}

const defaultLimits: HttpClientLimits = Object.freeze({
  bodyTimeoutMs: 30_000,
  connectTimeoutMs: 5_000,
  headersTimeoutMs: 8_000,
  idleTimeoutMs: 5_000,
  maxCompressedBytes: 50_000_000,
  maxDecompressedBytes: 50_000_000,
  maxRedirects: 3,
  totalTimeoutMs: 45_000,
});

const defaultResolver: MediaAddressResolver = Object.freeze({
  resolve: async (hostname: string) => {
    const literalFamily = hostname.includes(":")
      ? 6
      : /^\d+(?:\.\d+){3}$/u.test(hostname)
        ? 4
        : 0;
    if (literalFamily !== 0) {
      return [{ address: hostname, family: literalFamily as 4 | 6 }];
    }
    return (await lookup(hostname, { all: true, verbatim: true })).map(
      (result) => ({
        address: result.address,
        family: result.family as 4 | 6,
      }),
    );
  },
});

export class HardenedMediaClient {
  readonly #allowPrivateAddresses: boolean;
  readonly #allowedPorts: readonly number[];
  readonly #limits: HttpClientLimits;
  readonly #resolver: MediaAddressResolver;
  readonly #transport: HttpTransport;
  readonly #userAgent: string;

  constructor(options: HardenedMediaClientOptions = {}) {
    this.#allowPrivateAddresses = options.allowPrivateAddresses ?? false;
    this.#allowedPorts = Object.freeze([
      ...(options.allowedPorts ?? [80, 443]),
    ]);
    this.#limits = Object.freeze({ ...defaultLimits, ...options.limits });
    this.#resolver = options.resolver ?? defaultResolver;
    this.#transport = options.transport ?? new NodeHttpTransport();
    this.#userAgent =
      options.userAgent ??
      "MirthSpool/0.1 media-cache (+https://github.com/mirthspool)";
  }

  async download<T>(
    input: {
      readonly maxBytes: number;
      readonly signal?: AbortSignal;
      readonly url: string;
    },
    consume: (response: MediaDownloadResponse) => Promise<T>,
  ): Promise<T> {
    const limits = Object.freeze({
      ...this.#limits,
      maxCompressedBytes: Math.min(
        input.maxBytes,
        this.#limits.maxCompressedBytes,
      ),
      maxDecompressedBytes: Math.min(
        input.maxBytes,
        this.#limits.maxDecompressedBytes,
      ),
    });
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error("media request timed out")),
      limits.totalTimeoutMs,
    );
    const forwardAbort = () => controller.abort(input.signal?.reason);
    if (input.signal?.aborted) forwardAbort();
    else input.signal?.addEventListener("abort", forwardAbort, { once: true });
    let response: TransportResponse | undefined;
    try {
      const opened = await this.#open(input.url, controller.signal, limits);
      response = opened.response;
      return await consume(
        Object.freeze({
          body: decodeBoundedBody(response, limits),
          declaredMimeType: normalizedContentType(
            response.headers["content-type"],
          ),
          finalUrl: opened.url.toString(),
        }),
      );
    } catch (error) {
      if (controller.signal.aborted) {
        throw new MediaCacheError(
          input.signal?.aborted ? "MEDIA_ABORTED" : "MEDIA_RESPONSE_TIMEOUT",
          true,
          { cause: error },
        );
      }
      if (error instanceof MediaCacheError) throw error;
      throw new MediaCacheError("MEDIA_FETCH_FAILED", true, { cause: error });
    } finally {
      response?.cancel();
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", forwardAbort);
    }
  }

  async #open(
    rawUrl: string,
    signal: AbortSignal,
    limits: HttpClientLimits,
  ): Promise<{ readonly response: TransportResponse; readonly url: URL }> {
    let url = this.#validatedUrl(rawUrl);
    for (let redirect = 0; redirect <= limits.maxRedirects; redirect += 1) {
      let addresses: readonly ResolvedAddress[];
      try {
        addresses = await this.#resolver.resolve(url.hostname);
      } catch (error) {
        throw new MediaCacheError("MEDIA_DNS_FAILED", true, { cause: error });
      }
      let address: ResolvedAddress;
      try {
        address = assertAddressPolicy(addresses, this.#allowPrivateAddresses);
      } catch (error) {
        throw new MediaCacheError("MEDIA_ADDRESS_REJECTED", false, {
          cause: error,
        });
      }
      const response = await this.#transport.request({
        address,
        headers: Object.freeze({
          accept:
            "image/avif,image/webp,image/png,image/jpeg,image/gif,video/mp4,video/webm;q=0.9,*/*;q=0.1",
          "accept-encoding": "br, gzip, deflate",
          "user-agent": this.#userAgent,
        }),
        limits,
        method: "GET",
        signal,
        url,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.location;
        response.cancel();
        if (!location) throw new MediaCacheError("MEDIA_REDIRECT_INVALID");
        if (redirect === limits.maxRedirects) {
          throw new MediaCacheError("MEDIA_REDIRECT_LIMIT");
        }
        try {
          url = this.#validatedUrl(new URL(location, url).toString());
        } catch (error) {
          if (error instanceof MediaCacheError) throw error;
          throw new MediaCacheError("MEDIA_REDIRECT_INVALID", false, {
            cause: error,
          });
        }
        continue;
      }
      if (response.status === 404 || response.status === 410) {
        response.cancel();
        throw new MediaCacheError("MEDIA_NOT_FOUND");
      }
      if (response.status < 200 || response.status >= 300) {
        response.cancel();
        throw new MediaCacheError(
          "MEDIA_FETCH_FAILED",
          response.status === 408 ||
            response.status === 429 ||
            response.status >= 500,
        );
      }
      const contentLength = Number(response.headers["content-length"]);
      if (
        Number.isFinite(contentLength) &&
        contentLength > limits.maxCompressedBytes
      ) {
        response.cancel();
        throw new MediaCacheError("MEDIA_RESPONSE_TOO_LARGE");
      }
      const declared = normalizedContentType(response.headers["content-type"]);
      if (
        declared &&
        declared !== "application/octet-stream" &&
        !declared.startsWith("image/") &&
        !declared.startsWith("video/")
      ) {
        response.cancel();
        throw new MediaCacheError(
          declared === "text/html" || declared === "image/svg+xml"
            ? "MEDIA_ACTIVE_CONTENT"
            : "MEDIA_CONTENT_TYPE_UNSUPPORTED",
        );
      }
      return Object.freeze({ response, url });
    }
    throw new MediaCacheError("MEDIA_REDIRECT_LIMIT");
  }

  #validatedUrl(value: string): URL {
    try {
      return validateOutboundUrl(value, this.#allowedPorts);
    } catch (error) {
      throw new MediaCacheError("MEDIA_URL_REJECTED", false, { cause: error });
    }
  }
}

async function* decodeBoundedBody(
  response: TransportResponse,
  limits: HttpClientLimits,
): AsyncIterable<Uint8Array> {
  let compressedBytes = 0;
  async function* compressed() {
    for await (const chunk of response.body) {
      compressedBytes += chunk.byteLength;
      if (compressedBytes > limits.maxCompressedBytes) {
        throw new MediaCacheError("MEDIA_RESPONSE_TOO_LARGE");
      }
      yield chunk;
    }
  }
  const source = Readable.from(compressed());
  const encoding =
    response.headers["content-encoding"]?.trim().toLowerCase() ?? "identity";
  const decoded =
    encoding === "identity"
      ? source
      : encoding === "gzip"
        ? source.pipe(createGunzip())
        : encoding === "deflate"
          ? source.pipe(createInflate())
          : encoding === "br"
            ? source.pipe(createBrotliDecompress())
            : null;
  if (!decoded) throw new MediaCacheError("MEDIA_ENCODING_UNSUPPORTED");
  let decompressedBytes = 0;
  try {
    for await (const chunk of decoded) {
      const bytes = chunk instanceof Uint8Array ? chunk : Buffer.from(chunk);
      decompressedBytes += bytes.byteLength;
      if (decompressedBytes > limits.maxDecompressedBytes) {
        throw new MediaCacheError("MEDIA_RESPONSE_TOO_LARGE");
      }
      yield bytes;
    }
  } catch (error) {
    response.cancel();
    if (error instanceof MediaCacheError) throw error;
    throw new MediaCacheError("MEDIA_FETCH_FAILED", true, { cause: error });
  }
}

function normalizedContentType(value: string | undefined): string | null {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
}
