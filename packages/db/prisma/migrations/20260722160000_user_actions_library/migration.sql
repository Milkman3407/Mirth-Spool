-- M09 retains one row per user/content/action. For VIEW rows, occurredAt is the
-- first meaningful view, lastOccurredAt is the most recent coalesced view, and
-- occurrenceCount counts coalesced viewing windows rather than scroll events.
ALTER TABLE "UserAction"
  ADD COLUMN "lastOccurredAt" TIMESTAMPTZ(3),
  ADD COLUMN "occurrenceCount" INTEGER NOT NULL DEFAULT 1;

UPDATE "UserAction" SET "lastOccurredAt" = "occurredAt" WHERE "lastOccurredAt" IS NULL;

ALTER TABLE "UserAction" ALTER COLUMN "lastOccurredAt" SET NOT NULL;
ALTER TABLE "UserAction" ALTER COLUMN "lastOccurredAt" SET DEFAULT CURRENT_TIMESTAMP;

DROP INDEX IF EXISTS "UserAction_userId_kind_occurredAt_idx";
CREATE INDEX "UserAction_userId_kind_occurredAt_id_idx"
  ON "UserAction" ("userId", "kind", "occurredAt" DESC, "id" DESC);
CREATE INDEX "UserAction_userId_kind_lastOccurredAt_id_idx"
  ON "UserAction" ("userId", "kind", "lastOccurredAt" DESC, "id" DESC);

-- Deployment note: the UPDATE touches existing UserAction rows and the index
-- builds take table locks. Existing v0.1 installations have a small personal
-- action table; schedule a maintenance window before applying on a large table.
-- Rollback: drop the two *_id_idx indexes, recreate the former
-- UserAction_userId_kind_occurredAt_idx index, then drop lastOccurredAt and
-- occurrenceCount. A rollback loses revisit timing/count data only.
