import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export interface RateLimitStore {
  increment(
    key: string,
    windowSeconds: number,
  ): Promise<{ readonly count: number; readonly retryAfterSeconds: number }>;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly count: number;
  readonly retryAfterSeconds: number;
}

export function getClientAddress(
  headers: Headers,
  trustedProxyAddresses: readonly string[],
): string {
  const forwardingProxy = headers.get("x-mirthspool-forwarded-by")?.trim();
  if (!forwardingProxy || !trustedProxyAddresses.includes(forwardingProxy)) {
    return "direct";
  }
  const firstForwarded = headers
    .get("x-forwarded-for")
    ?.split(",", 1)[0]
    ?.trim();
  return firstForwarded && isIP(firstForwarded) !== 0
    ? firstForwarded
    : "unknown";
}

export function hashRateLimitSubject(
  secret: string,
  namespace: string,
  value: string,
): string {
  return createHmac("sha256", secret)
    .update(namespace)
    .update("\0")
    .update(value)
    .digest("base64url");
}

export async function consumeRateLimit(
  store: RateLimitStore,
  input: {
    readonly key: string;
    readonly limit: number;
    readonly windowSeconds: number;
  },
): Promise<RateLimitDecision> {
  const result = await store.increment(input.key, input.windowSeconds);
  return Object.freeze({
    allowed: result.count <= input.limit,
    count: result.count,
    retryAfterSeconds: result.retryAfterSeconds,
  });
}

export async function consumeInvitationAcceptanceLimits(
  store: RateLimitStore,
  input: {
    readonly address: string;
    readonly secret: string;
    readonly tokenHash: string;
  },
) {
  const [address, token] = await Promise.all([
    consumeRateLimit(store, {
      key: `invite-ip:${hashRateLimitSubject(
        input.secret,
        "invite-ip",
        input.address,
      )}`,
      limit: 10,
      windowSeconds: 900,
    }),
    consumeRateLimit(store, {
      key: `invite-token:${input.tokenHash}`,
      limit: 5,
      windowSeconds: 900,
    }),
  ]);
  return Object.freeze({
    allowed: address.allowed && token.allowed,
    retryAfterSeconds: Math.max(
      address.retryAfterSeconds,
      token.retryAfterSeconds,
    ),
  });
}
