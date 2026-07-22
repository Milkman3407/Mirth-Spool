import { createClient } from "redis";

const incrementScript = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("TTL", KEYS[1])
return {current, ttl}
`;

export interface FixedWindowCount {
  readonly count: number;
  readonly retryAfterSeconds: number;
}

export class RateLimitStoreUnavailableError extends Error {
  readonly code = "RATE_LIMIT_STORE_UNAVAILABLE" as const;

  constructor() {
    super("The rate-limit store is unavailable.");
    this.name = "RateLimitStoreUnavailableError";
  }
}

export class RedisFixedWindowStore {
  readonly #connectTimeoutMs: number;
  readonly #prefix: string;
  readonly #url: string;

  constructor(options: {
    readonly connectTimeoutMs?: number;
    readonly prefix?: string;
    readonly url: string;
  }) {
    this.#connectTimeoutMs = options.connectTimeoutMs ?? 750;
    this.#prefix = options.prefix ?? "mirthspool:rate-limit:";
    this.#url = options.url;
  }

  async increment(
    key: string,
    windowSeconds: number,
  ): Promise<FixedWindowCount> {
    if (key.length < 1 || key.length > 256) {
      throw new TypeError(
        "The rate-limit key must contain 1 to 256 characters.",
      );
    }
    if (
      !Number.isInteger(windowSeconds) ||
      windowSeconds < 1 ||
      windowSeconds > 86_400
    ) {
      throw new TypeError(
        "The rate-limit window must be between 1 and 86400 seconds.",
      );
    }

    const client = createClient({
      url: this.#url,
      socket: {
        connectTimeout: this.#connectTimeoutMs,
        reconnectStrategy: false,
      },
    });
    client.on("error", () => undefined);

    try {
      await client.connect();
      const result = await client.eval(incrementScript, {
        arguments: [String(windowSeconds)],
        keys: [`${this.#prefix}${key}`],
      });
      if (
        !Array.isArray(result) ||
        typeof result[0] !== "number" ||
        typeof result[1] !== "number"
      ) {
        throw new Error("Unexpected Redis response.");
      }
      return Object.freeze({
        count: result[0],
        retryAfterSeconds: Math.max(1, result[1]),
      });
    } catch {
      throw new RateLimitStoreUnavailableError();
    } finally {
      try {
        client.destroy();
      } catch {
        // Failed connections may already be closed.
      }
    }
  }
}
