import { randomUUID } from "node:crypto";

import { createClient } from "redis";

import type {
  ConnectorOAuthToken,
  ConnectorTokenCache,
} from "@mirthspool/connectors";

const releaseLockScript = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

type CachedToken = ConnectorOAuthToken;

function parseCachedToken(
  value: string | null,
  now: number,
): CachedToken | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CachedToken>;
    const expiresAt =
      typeof parsed.expiresAt === "string" ? Date.parse(parsed.expiresAt) : NaN;
    if (
      typeof parsed.accessToken !== "string" ||
      parsed.accessToken.length < 1 ||
      parsed.accessToken.length > 8_192 ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= now + 30_000
    )
      return null;
    return Object.freeze({
      accessToken: parsed.accessToken,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  } catch {
    return null;
  }
}

export class OAuthTokenCacheUnavailableError extends Error {
  readonly code = "OAUTH_TOKEN_CACHE_UNAVAILABLE" as const;

  constructor() {
    super("The OAuth token cache is unavailable.");
    this.name = "OAuthTokenCacheUnavailableError";
  }
}

export class RedisOAuthTokenCache implements ConnectorTokenCache {
  readonly #connectTimeoutMs: number;
  readonly #now: () => Date;
  readonly #prefix: string;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #url: string;

  constructor(options: {
    readonly connectTimeoutMs?: number;
    readonly now?: () => Date;
    readonly prefix?: string;
    readonly sleep?: (milliseconds: number) => Promise<void>;
    readonly url: string;
  }) {
    this.#connectTimeoutMs = options.connectTimeoutMs ?? 750;
    this.#now = options.now ?? (() => new Date());
    this.#prefix = options.prefix ?? "mirthspool:oauth-token:";
    this.#sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.#url = options.url;
  }

  async getOrCreate(
    key: string,
    acquire: () => Promise<ConnectorOAuthToken>,
  ): Promise<ConnectorOAuthToken> {
    if (!/^[a-f0-9]{64}$/u.test(key))
      throw new TypeError("OAuth cache keys must be SHA-256 hex digests.");
    const client = createClient({
      url: this.#url,
      socket: {
        connectTimeout: this.#connectTimeoutMs,
        reconnectStrategy: false,
      },
    });
    client.on("error", () => undefined);
    const cacheKey = `${this.#prefix}${key}`;
    const lockKey = `${cacheKey}:lock`;
    const lockValue = randomUUID();
    try {
      await client.connect();
      const cached = parseCachedToken(
        await client.get(cacheKey),
        this.#now().valueOf(),
      );
      if (cached) return cached;
      const locked = await client.set(lockKey, lockValue, {
        NX: true,
        PX: 5_000,
      });
      if (locked !== "OK") {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          await this.#sleep(50);
          const shared = parseCachedToken(
            await client.get(cacheKey),
            this.#now().valueOf(),
          );
          if (shared) return shared;
        }
        throw new OAuthTokenCacheUnavailableError();
      }
      try {
        const token = await acquire();
        const expiresAt = Date.parse(token.expiresAt);
        if (
          !Number.isFinite(expiresAt) ||
          expiresAt <= this.#now().valueOf() + 30_000
        ) {
          throw new TypeError(
            "OAuth token expiry must be at least 30 seconds in the future.",
          );
        }
        const ttlSeconds = Math.max(
          1,
          Math.floor((expiresAt - this.#now().valueOf() - 30_000) / 1_000),
        );
        const normalized = Object.freeze({
          accessToken: token.accessToken,
          expiresAt: new Date(expiresAt).toISOString(),
        });
        await client.set(cacheKey, JSON.stringify(normalized), {
          EX: ttlSeconds,
        });
        return normalized;
      } finally {
        await client.eval(releaseLockScript, {
          arguments: [lockValue],
          keys: [lockKey],
        });
      }
    } catch (error) {
      if (
        error instanceof TypeError ||
        error instanceof OAuthTokenCacheUnavailableError
      )
        throw error;
      throw new OAuthTokenCacheUnavailableError();
    } finally {
      try {
        client.destroy();
      } catch {
        /* Failed connections may already be closed. */
      }
    }
  }
}
