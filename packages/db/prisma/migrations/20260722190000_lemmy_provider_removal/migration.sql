-- M10 adds per-occurrence provider removal state. The nullable column requires
-- no table rewrite or backfill; existing occurrences remain active.
ALTER TABLE "SourcePost"
ADD COLUMN "providerDeletedAt" TIMESTAMPTZ(3),
ADD COLUMN "communityName" TEXT,
ADD COLUMN "providerCommentCount" INTEGER;

-- This index supports source cleanup and reconciliation without scanning every
-- historical occurrence. On very large installations, deploy the equivalent
-- index concurrently in a provider-specific maintenance window.
CREATE INDEX "SourcePost_sourceId_providerDeletedAt_idx"
ON "SourcePost"("sourceId", "providerDeletedAt");

-- Rollback (only before code depending on this field is deployed):
-- DROP INDEX "SourcePost_sourceId_providerDeletedAt_idx";
-- ALTER TABLE "SourcePost" DROP COLUMN "providerDeletedAt",
--   DROP COLUMN "communityName", DROP COLUMN "providerCommentCount";
