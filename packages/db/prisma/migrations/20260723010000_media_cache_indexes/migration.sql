-- Storage keys are generated opaque identifiers. Uniqueness prevents two
-- metadata rows from ever claiming the same durable object.
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- Supports bounded expiry/LRU cache-maintenance scans. This is an online-safe
-- empty-table migration for the initial release; larger deployments should use
-- CREATE INDEX CONCURRENTLY during a maintenance window.
CREATE INDEX "MediaAsset_cache_eviction_idx"
  ON "MediaAsset"("cacheState", "cacheExpiresAt", "lastAccessedAt");
