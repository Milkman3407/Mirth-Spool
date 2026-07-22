export type CachePolicyName =
  | "ALL_WITHIN_QUOTA"
  | "FAVORITES_ONLY"
  | "NONE"
  | "TTL";

export type CacheableMediaKind = "ANIMATED_IMAGE" | "IMAGE" | "VIDEO";

export interface CachePolicyConfiguration {
  readonly allowedKinds: readonly CacheableMediaKind[];
  readonly maxObjectBytes: number;
  readonly policy: CachePolicyName;
  readonly quotaBytes: number;
  readonly ttlSeconds: number;
}

export interface CacheCandidate {
  readonly cacheExpiresAt: Date | null;
  readonly cachedAt: Date | null;
  readonly favorite: boolean;
  readonly id: string;
  readonly lastAccessedAt: Date | null;
  readonly size: number;
}

export function shouldCacheMedia(input: {
  readonly favorite: boolean;
  readonly kind: string;
  readonly policy: CachePolicyConfiguration;
}): boolean {
  if (input.policy.policy === "NONE") return false;
  if (!input.policy.allowedKinds.includes(input.kind as CacheableMediaKind))
    return false;
  return input.policy.policy !== "FAVORITES_ONLY" || input.favorite;
}

export function selectEvictions(
  candidates: readonly CacheCandidate[],
  input: {
    readonly bytesNeeded: number;
    readonly now: Date;
    readonly policy: CachePolicyName;
  },
): readonly CacheCandidate[] {
  if (input.bytesNeeded <= 0) return Object.freeze([]);
  const eligible = candidates
    .filter(
      (candidate) => input.policy !== "FAVORITES_ONLY" || !candidate.favorite,
    )
    .sort((left, right) => {
      const leftExpired =
        left.cacheExpiresAt !== null && left.cacheExpiresAt <= input.now;
      const rightExpired =
        right.cacheExpiresAt !== null && right.cacheExpiresAt <= input.now;
      if (leftExpired !== rightExpired) return leftExpired ? -1 : 1;
      if (left.favorite !== right.favorite) return left.favorite ? 1 : -1;
      const leftAccess =
        left.lastAccessedAt?.valueOf() ?? left.cachedAt?.valueOf() ?? 0;
      const rightAccess =
        right.lastAccessedAt?.valueOf() ?? right.cachedAt?.valueOf() ?? 0;
      return leftAccess - rightAccess || left.id.localeCompare(right.id);
    });
  const selected: CacheCandidate[] = [];
  let recovered = 0;
  for (const candidate of eligible) {
    selected.push(candidate);
    recovered += candidate.size;
    if (recovered >= input.bytesNeeded) break;
  }
  return Object.freeze(recovered >= input.bytesNeeded ? selected : []);
}
