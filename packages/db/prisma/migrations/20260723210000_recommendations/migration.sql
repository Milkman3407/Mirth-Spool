ALTER TABLE "UserPreference"
  ADD COLUMN "recommendationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "recommendationResetAt" TIMESTAMPTZ(3);

CREATE TABLE "RecommendationProfile" (
  "userId" UUID NOT NULL,
  "scoringVersion" INTEGER NOT NULL DEFAULT 1,
  "computedAt" TIMESTAMPTZ(3) NOT NULL,
  "lastActionAt" TIMESTAMPTZ(3),
  "sampledActionCount" INTEGER NOT NULL,
  "explicitActionCount" INTEGER NOT NULL,
  "truncated" BOOLEAN NOT NULL DEFAULT false,
  "featuresJson" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "RecommendationProfile_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "RecommendationProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RecommendationProfile_computedAt_idx"
  ON "RecommendationProfile"("computedAt");
