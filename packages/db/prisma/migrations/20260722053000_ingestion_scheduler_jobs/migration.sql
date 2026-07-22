-- M06 ingestion scheduling metadata and the database-level single-run lease.
-- Rollback: drop ingestion_runs_one_running_per_source_idx, then drop the
-- IngestionRun_jobId_idx index and the jobId/attempt columns. Rolling back while
-- workers are active can permit overlapping polls and must be done during downtime.
ALTER TABLE "IngestionRun"
  ADD COLUMN "jobId" TEXT,
  ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "IngestionRun_jobId_idx" ON "IngestionRun"("jobId");

CREATE UNIQUE INDEX "ingestion_runs_one_running_per_source_idx"
  ON "IngestionRun"("sourceId")
  WHERE "status" = 'RUNNING';
