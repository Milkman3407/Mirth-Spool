-- M03 authentication foundation. M02 did not expose user creation, so any
-- pre-existing row must already contain the identity fields made mandatory here.
ALTER TABLE "User"
  ALTER COLUMN "emailVerified" TYPE BOOLEAN USING ("emailVerified" IS NOT NULL),
  ALTER COLUMN "emailVerified" SET DEFAULT false,
  ALTER COLUMN "emailVerified" SET NOT NULL,
  ALTER COLUMN "email" SET NOT NULL,
  ALTER COLUMN "emailNormalized" SET NOT NULL,
  ALTER COLUMN "name" SET NOT NULL;

ALTER TABLE "Session"
  ADD COLUMN "ipAddress" TEXT,
  ADD COLUMN "userAgent" TEXT;

CREATE TABLE "CredentialAccount" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CredentialAccount_pkey" PRIMARY KEY ("id")
);

-- Preserve any credential hashes provisioned out-of-band before M03.
INSERT INTO "CredentialAccount" (
  "id", "userId", "accountId", "providerId", "passwordHash", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), "id", "emailNormalized", 'credential', "passwordHash", "createdAt", "updatedAt"
FROM "User"
WHERE "passwordHash" IS NOT NULL;

ALTER TABLE "User" DROP COLUMN "passwordHash";

CREATE UNIQUE INDEX "CredentialAccount_providerId_accountId_key"
  ON "CredentialAccount"("providerId", "accountId");
CREATE INDEX "CredentialAccount_userId_idx" ON "CredentialAccount"("userId");
ALTER TABLE "CredentialAccount" ADD CONSTRAINT "CredentialAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
