import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { lookup } from "node:dns/promises";
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import { Readable } from "node:stream";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import type { ClientRequest } from "node:http";
import type { z } from "zod";

import { classifyHttpStatus, ConnectorError } from "./errors.js";
import {
  assertAddressPolicy,
  type ResolvedAddress,
  validateOutboundUrl,
} from "./ip-policy.js";
import type {
  ConnectorHttpClient,
  ConnectorLogger,
  HardenedHttpRequest,
  HardenedHttpResponse,
} from "./types.js";

export interface HttpClientLimits {
  readonly bodyTimeoutMs: number;
  readonly connectTimeoutMs: number;
  readonly headersTimeoutMs: number;
  readonly idleTimeoutMs: number;
  readonly maxCompressedBytes: number;
  readonly maxDecompressedBytes: number;
  readonly maxRedirects: number;
  readonly totalTimeoutMs: number;
}

export const DEFAULT_HTTP_LIMITS: HttpClientLimits = Object.freeze({
  bodyTimeoutMs: 15_000,
  connectTimeoutMs: 5_000,
  headersTimeoutMs: 8_000,
  idleTimeoutMs: 5_000,
  maxCompressedBytes: 2_000_000,
  maxDecompressedBytes: 5_000_000,
  maxRedirects: 3,
  totalTimeoutMs: 20_000,
});

export interface TransportResponse {
  readonly body: AsyncIterable<Uint8Array>;
  cancel(): void;
  readonly headers: Readonly<Record<string, string>>;
  readonly status: number;
}

export interface ResolvedTransportRequest {
  readonly address: ResolvedAddress;
  readonly body?: Uint8Array;
  readonly headers: Readonly<Record<string, string>>;
  readonly limits: HttpClientLimits;
  readonly method: "GET" | "HEAD" | "POST";
  readonly signal: AbortSignal;
  readonly url: URL;
}

export interface HttpTransport {
  request(input: ResolvedTransportRequest): Promise<TransportResponse>;
}

export interface AddressResolver {
  resolve(hostname: string): Promise<readonly ResolvedAddress[]>;
}

export interface TimerScheduler {
  clear(handle: unknown): void;
  set(callback: () => void, milliseconds: number): unknown;
}

const defaultTimer: TimerScheduler = Object.freeze({
  clear: (handle: unknown) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
  set: (callback: () => void, milliseconds: number) =>
    setTimeout(callback, milliseconds),
});

const defaultResolver: AddressResolver = Object.freeze({
  resolve: async (hostname: string) => {
    const literalFamily = hostname.includes(":")
      ? 6
      : /^\d+(?:\.\d+){3}$/u.test(hostname)
        ? 4
        : 0;
    if (literalFamily !== 0) {
      return [{ address: hostname, family: literalFamily as 4 | 6 }];
    }
    const results = await lookup(hostname, { all: true, verbatim: true });
    return results.map((result) => ({
      address: result.address,
      family: result.family as 4 | 6,
    }));
  },
});

const sensitiveRedirectHeaders = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
]);
const forbiddenRequestHeaders = new Set([
  "connection",
  "content-length",
  "host",
  "proxy-connection",
  "transfer-encoding",
]);

function normalizeHeaders(
  headers: IncomingHttpHeaders,
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined) {
      result[name.toLowerCase()] =
        typeof value === "string"
          ? value
          : Array.isArray(value)
            ? value.join(", ")
            : String(value);
    }
  }
  return Object.freeze(result);
}

function requestHeaders(
  input: Readonly<Record<string, string>> | undefined,
  userAgent: string,
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {
    accept: "application/json, application/xml, text/xml, */*;q=0.1",
    "user-agent": userAgent,
  };
  for (const [rawName, value] of Object.entries(input ?? {})) {
    const name = rawName.toLowerCase();
    if (forbiddenRequestHeaders.has(name) || /[\r\n]/u.test(name + value)) {
      throw new ConnectorError("CONFIGURATION", {
        code: "SOURCE_HEADER_INVALID",
      });
    }
    result[name] = value;
  }
  result["user-agent"] = userAgent;
  return Object.freeze(result);
}

function createNodeRequest(input: ResolvedTransportRequest): ClientRequest {
  const requestFunction =
    input.url.protocol === "https:" ? requestHttps : requestHttp;
  const port =
    input.url.port === ""
      ? input.url.protocol === "https:"
        ? 443
        : 80
      : Number(input.url.port);
  const hostHeader =
    input.url.port === ""
      ? input.url.hostname
      : `${input.url.hostname}:${input.url.port}`;
  return requestFunction({
    agent: false,
    family: input.address.family,
    headers: {
      ...input.headers,
      host: hostHeader,
      ...(input.body === undefined
        ? {}
        : { "content-length": String(input.body.byteLength) }),
    },
    hostname: input.address.address,
    method: input.method,
    path: `${input.url.pathname}${input.url.search}`,
    port,
    protocol: input.url.protocol,
    servername: input.url.hostname,
    signal: input.signal,
  });
}

export class NodeHttpTransport implements HttpTransport {
  request(input: ResolvedTransportRequest): Promise<TransportResponse> {
    return new Promise((resolve, reject) => {
      const request = createNodeRequest(input);
      const headerTimer = setTimeout(
        () => request.destroy(new Error("response headers timed out")),
        input.limits.headersTimeoutMs,
      );
      request.once("socket", (socket) => {
        if (!socket.connecting) return;
        const connectTimer = setTimeout(
          () => request.destroy(new Error("connection timed out")),
          input.limits.connectTimeoutMs,
        );
        const clear = () => clearTimeout(connectTimer);
        socket.once(
          input.url.protocol === "https:" ? "secureConnect" : "connect",
          clear,
        );
        socket.once("error", clear);
      });
      request.once("response", (response: IncomingMessage) => {
        clearTimeout(headerTimer);
        response.setTimeout(input.limits.idleTimeoutMs, () =>
          response.destroy(new Error("response became idle")),
        );
        const bodyTimer = setTimeout(
          () => response.destroy(new Error("response body timed out")),
          input.limits.bodyTimeoutMs,
        );
        response.once("close", () => clearTimeout(bodyTimer));
        resolve({
          body: response,
          cancel: () => response.destroy(),
          headers: normalizeHeaders(response.headers),
          status: response.statusCode ?? 502,
        });
      });
      request.once("error", (error) => {
        clearTimeout(headerTimer);
        reject(error);
      });
      request.end(input.body);
    });
  }
}

function matchingContentType(
  headers: Readonly<Record<string, string>>,
  expected: readonly string[] | undefined,
): boolean {
  if (!expected || expected.length === 0) return true;
  const actual = headers["content-type"]
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  return (
    actual !== undefined &&
    expected.some((value) => value.toLowerCase() === actual)
  );
}

async function readBoundedBody(
  response: TransportResponse,
  limits: HttpClientLimits,
): Promise<Uint8Array> {
  let compressedBytes = 0;
  async function* boundedCompressed() {
    for await (const chunk of response.body) {
      compressedBytes += chunk.byteLength;
      if (compressedBytes > limits.maxCompressedBytes) {
        response.cancel();
        throw new ConnectorError("MALFORMED_RESPONSE", {
          code: "SOURCE_RESPONSE_TOO_LARGE",
        });
      }
      yield chunk;
    }
  }
  const encoding =
    response.headers["content-encoding"]?.trim().toLowerCase() ?? "identity";
  const source = Readable.from(boundedCompressed());
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
  if (!decoded) {
    response.cancel();
    throw new ConnectorError("MALFORMED_RESPONSE", {
      code: "SOURCE_ENCODING_UNSUPPORTED",
    });
  }
  const chunks: Uint8Array[] = [];
  let decodedBytes = 0;
  try {
    for await (const chunk of decoded) {
      const bytes = chunk instanceof Uint8Array ? chunk : Buffer.from(chunk);
      decodedBytes += bytes.byteLength;
      if (decodedBytes > limits.maxDecompressedBytes) {
        response.cancel();
        throw new ConnectorError("MALFORMED_RESPONSE", {
          code: "SOURCE_RESPONSE_TOO_LARGE",
        });
      }
      chunks.push(bytes);
    }
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError("MALFORMED_RESPONSE", {
      cause: error,
      code: "SOURCE_BODY_MALFORMED",
    });
  }
  return Buffer.concat(chunks, decodedBytes);
}

class BufferedResponse implements HardenedHttpResponse {
  constructor(
    readonly body: Uint8Array,
    readonly headers: Readonly<Record<string, string>>,
    readonly status: number,
    readonly url: string,
  ) {}

  json<T>(schema: z.ZodType<T>): T {
    try {
      return schema.parse(JSON.parse(this.text()));
    } catch (error) {
      throw new ConnectorError("MALFORMED_RESPONSE", {
        cause: error,
        code: "SOURCE_JSON_MALFORMED",
      });
    }
  }

  text(): string {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(this.body);
    } catch (error) {
      throw new ConnectorError("MALFORMED_RESPONSE", {
        cause: error,
        code: "SOURCE_TEXT_MALFORMED",
      });
    }
  }
}

export interface HardenedHttpClientOptions {
  readonly allowPrivateAddresses?: boolean;
  readonly allowedPorts?: readonly number[];
  readonly limits?: Partial<HttpClientLimits>;
  readonly logger: ConnectorLogger;
  readonly resolver?: AddressResolver;
  readonly timer?: TimerScheduler;
  readonly transport?: HttpTransport;
  readonly userAgent?: string;
}

export class HardenedHttpClient implements ConnectorHttpClient {
  readonly #allowPrivateAddresses: boolean;
  readonly #allowedPorts: readonly number[];
  readonly #limits: HttpClientLimits;
  readonly #logger: ConnectorLogger;
  readonly #resolver: AddressResolver;
  readonly #timer: TimerScheduler;
  readonly #transport: HttpTransport;
  readonly #userAgent: string;

  constructor(options: HardenedHttpClientOptions) {
    this.#allowPrivateAddresses = options.allowPrivateAddresses ?? false;
    this.#allowedPorts = Object.freeze([
      ...(options.allowedPorts ?? [80, 443]),
    ]);
    this.#limits = Object.freeze({ ...DEFAULT_HTTP_LIMITS, ...options.limits });
    this.#logger = options.logger;
    this.#resolver = options.resolver ?? defaultResolver;
    this.#timer = options.timer ?? defaultTimer;
    this.#transport = options.transport ?? new NodeHttpTransport();
    this.#userAgent =
      options.userAgent ?? "MirthSpool/0.1 (+https://github.com/mirthspool)";
  }

  async request(input: HardenedHttpRequest): Promise<HardenedHttpResponse> {
    const totalController = new AbortController();
    const totalTimer = this.#timer.set(
      () => totalController.abort(new Error("request timed out")),
      this.#limits.totalTimeoutMs,
    );
    const forwardCallerAbort = () =>
      totalController.abort(input.signal?.reason);
    if (input.signal?.aborted) {
      forwardCallerAbort();
    } else {
      input.signal?.addEventListener("abort", forwardCallerAbort, {
        once: true,
      });
    }
    const signal = totalController.signal;
    try {
      return await this.#requestWithRedirects(input, signal);
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      this.#logger.warn("connector transport failed", {
        errorCode:
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : undefined,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      throw new ConnectorError("TRANSIENT", {
        cause: error,
        code: signal.aborted
          ? "SOURCE_REQUEST_TIMEOUT"
          : "SOURCE_REQUEST_FAILED",
      });
    } finally {
      input.signal?.removeEventListener("abort", forwardCallerAbort);
      this.#timer.clear(totalTimer);
    }
  }

  async #requestWithRedirects(
    input: HardenedHttpRequest,
    signal: AbortSignal,
  ): Promise<HardenedHttpResponse> {
    let url: URL;
    try {
      url = validateOutboundUrl(input.url, this.#allowedPorts);
    } catch (error) {
      throw new ConnectorError("CONFIGURATION", {
        cause: error,
        code: "SOURCE_URL_REJECTED",
      });
    }
    let headers = requestHeaders(input.headers, this.#userAgent);
    let method = input.method ?? "GET";
    let body = input.body;
    for (
      let redirect = 0;
      redirect <= this.#limits.maxRedirects;
      redirect += 1
    ) {
      let resolved: readonly ResolvedAddress[];
      try {
        resolved = await this.#resolver.resolve(url.hostname);
      } catch (error) {
        throw new ConnectorError("TRANSIENT", {
          cause: error,
          code: "SOURCE_DNS_FAILED",
        });
      }
      let address: ResolvedAddress;
      try {
        address = assertAddressPolicy(resolved, this.#allowPrivateAddresses);
      } catch (error) {
        throw new ConnectorError("CONFIGURATION", {
          cause: error,
          code: "SOURCE_ADDRESS_REJECTED",
        });
      }
      this.#logger.debug("connector request", { method, origin: url.origin });
      const response = await this.#transport.request({
        address,
        ...(body === undefined ? {} : { body }),
        headers,
        limits: this.#limits,
        method,
        signal,
        url,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.location;
        response.cancel();
        if (!location) {
          throw new ConnectorError("MALFORMED_RESPONSE", {
            code: "SOURCE_REDIRECT_INVALID",
          });
        }
        if (redirect === this.#limits.maxRedirects) {
          throw new ConnectorError("PERMANENT", {
            code: "SOURCE_REDIRECT_LIMIT",
          });
        }
        const next = validateOutboundUrl(
          new URL(location, url).toString(),
          this.#allowedPorts,
        );
        if (next.origin !== url.origin) {
          headers = Object.freeze(
            Object.fromEntries(
              Object.entries(headers).filter(
                ([name]) => !sensitiveRedirectHeaders.has(name),
              ),
            ),
          );
        }
        if (response.status === 303 && method !== "HEAD") {
          method = "GET";
          body = undefined;
        }
        url = next;
        continue;
      }
      const accepted =
        response.status >= 200 && response.status < 300
          ? true
          : (input.acceptedStatuses?.includes(response.status) ?? false);
      if (!accepted) {
        response.cancel();
        const retryAfter = Number(response.headers["retry-after"]);
        throw classifyHttpStatus(
          response.status,
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter
            : undefined,
        );
      }
      if (
        response.status !== 304 &&
        !matchingContentType(response.headers, input.expectedContentTypes)
      ) {
        response.cancel();
        throw new ConnectorError("MALFORMED_RESPONSE", {
          code: "SOURCE_CONTENT_TYPE_UNSUPPORTED",
        });
      }
      const contentLength = Number(response.headers["content-length"]);
      if (
        Number.isFinite(contentLength) &&
        contentLength > this.#limits.maxCompressedBytes
      ) {
        response.cancel();
        throw new ConnectorError("MALFORMED_RESPONSE", {
          code: "SOURCE_RESPONSE_TOO_LARGE",
        });
      }
      const responseBody =
        method === "HEAD"
          ? new Uint8Array()
          : await readBoundedBody(response, this.#limits);
      this.#logger.debug("connector response", {
        origin: url.origin,
        status: response.status,
      });
      return new BufferedResponse(
        responseBody,
        response.headers,
        response.status,
        url.toString(),
      );
    }
    throw new ConnectorError("PERMANENT", { code: "SOURCE_REDIRECT_LIMIT" });
  }
}
