-- M18 multi-user invitations.
--
-- Deployment notes:
-- - New tables and indexes are additive. Existing User, Session, UserAction, and
--   AuditEvent rows are not rewritten.
-- - The bounded INSERT below creates one preference row per existing user and
--   preserves the original administrator's effective history/rating behavior.
-- - Rollback requires restoring a pre-migration backup before application code
--   is rolled back. Dropping these tables would discard invitations and member
--   preferences, so no destructive automatic down migration is provided.

CREATE TABLE "Invitation" (
  "id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMPTZ(3),
  "acceptedAt" TIMESTAMPTZ(3),
  "acceptedUserId" UUID,
  CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserPreference" (
  "userId" UUID NOT NULL,
  "historyEnabled" BOOLEAN NOT NULL DEFAULT true,
  "maximumContentRating" "ContentRating" NOT NULL DEFAULT 'SAFE',
  "defaultFeedMode" TEXT NOT NULL DEFAULT 'new',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId")
);

INSERT INTO "UserPreference" (
  "userId",
  "historyEnabled",
  "maximumContentRating",
  "defaultFeedMode",
  "updatedAt"
)
SELECT
  users."id",
  COALESCE(
    (
      SELECT (setting."value" #>> '{}')::boolean
      FROM "AppSetting" setting
      WHERE setting."key" = 'history.enabled'
    ),
    true
  ),
  COALESCE(
    (
      SELECT (setting."value" #>> '{}')::"ContentRating"
      FROM "AppSetting" setting
      WHERE setting."key" = 'content.maximumRating'
    ),
    'SAFE'::"ContentRating"
  ),
  'new',
  CURRENT_TIMESTAMP
FROM "User" users
ON CONFLICT ("userId") DO NOTHING;

CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
CREATE UNIQUE INDEX "Invitation_acceptedUserId_key" ON "Invitation"("acceptedUserId");
CREATE INDEX "Invitation_emailNormalized_createdAt_idx"
  ON "Invitation"("emailNormalized", "createdAt" DESC);
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");
CREATE INDEX "Invitation_createdByUserId_createdAt_idx"
  ON "Invitation"("createdByUserId", "createdAt" DESC);

ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptedUserId_fkey"
  FOREIGN KEY ("acceptedUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
