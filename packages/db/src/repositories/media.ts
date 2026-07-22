import type { CacheState, Prisma } from "../generated/prisma/client.js";
import type { RepositoryClient } from "../repository-types.js";

export function listMediaForContent(
  client: RepositoryClient,
  contentItemId: string,
) {
  return client.mediaAsset.findMany({
    where: { contentItemId },
    orderBy: { ordinal: "asc" },
  });
}

export function updateMediaCacheMetadata(
  client: RepositoryClient,
  input: {
    readonly id: string;
    readonly state: CacheState;
    readonly storageKey?: string | null;
    readonly cachedAt?: Date | null;
    readonly cacheExpiresAt?: Date | null;
    readonly errorCode?: string | null;
  },
) {
  const data: Prisma.MediaAssetUpdateInput = {
    cacheState: input.state,
    ...(input.storageKey !== undefined ? { storageKey: input.storageKey } : {}),
    ...(input.cachedAt !== undefined ? { cachedAt: input.cachedAt } : {}),
    ...(input.cacheExpiresAt !== undefined
      ? { cacheExpiresAt: input.cacheExpiresAt }
      : {}),
    ...(input.errorCode !== undefined
      ? {
          cacheErrorCode:
            input.errorCode === null ? null : input.errorCode.slice(0, 100),
        }
      : {}),
  };
  return client.mediaAsset.update({ where: { id: input.id }, data });
}
