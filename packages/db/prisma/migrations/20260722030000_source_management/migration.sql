-- M04 source management. Source rows are currently unreachable through the M03
-- application, so this nullable metadata-only change requires no backfill.
ALTER TABLE "Source" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);

CREATE INDEX "Source_deletedAt_idx" ON "Source"("deletedAt");

-- M03 exposed no credential writer, so existing duplicate triples are not
-- expected. This constraint makes credential rotation an idempotent upsert.
CREATE UNIQUE INDEX "SourceCredential_sourceId_kind_label_key"
  ON "SourceCredential"("sourceId", "kind", "label");
