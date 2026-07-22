-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('RSS', 'LEMMY', 'MASTODON', 'REDDIT');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DEGRADED', 'AUTH_ERROR', 'CONFIG_ERROR');

-- CreateEnum
CREATE TYPE "ContentRating" AS ENUM ('SAFE', 'SENSITIVE', 'ADULT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('ACTIVE', 'REMOVED_AT_SOURCE', 'BROKEN', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'ANIMATED_IMAGE', 'VIDEO', 'LINK');

-- CreateEnum
CREATE TYPE "CachePolicy" AS ENUM ('NONE', 'FAVORITES_ONLY', 'TTL', 'ALL_WITHIN_QUOTA');

-- CreateEnum
CREATE TYPE "CacheState" AS ENUM ('REMOTE_ONLY', 'QUEUED', 'FETCHING', 'CACHED', 'EVICTED', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ActionKind" AS ENUM ('FAVORITE', 'HIDE', 'VIEW');

-- CreateEnum
CREATE TYPE "RunTrigger" AS ENUM ('SCHEDULED', 'MANUAL', 'RETRY', 'BACKFILL');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CredentialKind" AS ENUM ('OAUTH_CLIENT', 'ACCESS_TOKEN', 'BASIC_AUTH', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DuplicateReason" AS ENUM ('CANONICAL_URL', 'SHA256', 'PERCEPTUAL_HASH', 'MANUAL');

-- CreateEnum
CREATE TYPE "TagSource" AS ENUM ('ADMIN', 'PROVIDER', 'RULE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "emailNormalized" TEXT,
    "emailVerified" TIMESTAMPTZ(3),
    "username" TEXT,
    "usernameNormalized" TEXT,
    "name" TEXT,
    "image" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
    "disabledAt" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expires" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" UUID NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "SourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "pollIntervalSeconds" INTEGER NOT NULL DEFAULT 900,
    "defaultContentRating" "ContentRating" NOT NULL DEFAULT 'UNKNOWN',
    "minimumScore" INTEGER,
    "configJson" JSONB NOT NULL,
    "nextPollAt" TIMESTAMPTZ(3),
    "lastAttemptAt" TIMESTAMPTZ(3),
    "lastSuccessAt" TIMESTAMPTZ(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceCredential" (
    "id" UUID NOT NULL,
    "sourceId" UUID,
    "kind" "CredentialKind" NOT NULL,
    "label" TEXT NOT NULL,
    "encryptedPayload" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SourceCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceCheckpoint" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SourceCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRun" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "trigger" "RunTrigger" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "providerRequests" INTEGER NOT NULL DEFAULT 0,
    "bytesFetched" BIGINT NOT NULL DEFAULT 0,
    "itemsSeen" INTEGER NOT NULL DEFAULT 0,
    "itemsCreated" INTEGER NOT NULL DEFAULT 0,
    "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
    "itemsSkipped" INTEGER NOT NULL DEFAULT 0,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "rateLimitResetAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" UUID NOT NULL,
    "title" TEXT,
    "normalizedTitle" TEXT,
    "summary" TEXT,
    "authorName" TEXT,
    "authorExternalId" TEXT,
    "contentRating" "ContentRating" NOT NULL DEFAULT 'UNKNOWN',
    "contentWarning" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'ACTIVE',
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "primarySourcePostId" UUID,
    "canonicalUrl" TEXT,
    "canonicalUrlHash" TEXT,
    "rankingScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "searchText" TEXT,
    "duplicateGroupId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcePost" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "contentItemId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "providerUrl" TEXT,
    "providerAuthor" TEXT,
    "providerScore" INTEGER,
    "providerPublishedAt" TIMESTAMPTZ(3),
    "providerUpdatedAt" TIMESTAMPTZ(3),
    "rawPayload" JSONB,
    "rawPayloadBytes" INTEGER,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourcePost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "contentItemId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "remoteUrl" TEXT NOT NULL,
    "canonicalRemoteUrl" TEXT,
    "mimeType" TEXT,
    "byteLength" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMilliseconds" INTEGER,
    "sha256" TEXT,
    "perceptualHash" TEXT,
    "cachePolicy" "CachePolicy" NOT NULL DEFAULT 'NONE',
    "cacheState" "CacheState" NOT NULL DEFAULT 'REMOTE_ONLY',
    "storageKey" TEXT,
    "cachedAt" TIMESTAMPTZ(3),
    "cacheExpiresAt" TIMESTAMPTZ(3),
    "lastAccessedAt" TIMESTAMPTZ(3),
    "cacheErrorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "contentItemId" UUID NOT NULL,
    "kind" "ActionKind" NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" JSONB,

    CONSTRAINT "UserAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentTag" (
    "contentItemId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "source" "TagSource" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentTag_pkey" PRIMARY KEY ("contentItemId","tagId","source")
);

-- CreateTable
CREATE TABLE "DuplicateGroup" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DuplicateGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateLink" (
    "id" UUID NOT NULL,
    "fromContentId" UUID NOT NULL,
    "toContentId" UUID NOT NULL,
    "reason" "DuplicateReason" NOT NULL,
    "distance" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "eventType" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadataJson" JSONB,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_emailNormalized_key" ON "User"("emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_usernameNormalized_key" ON "User"("usernameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_expires_idx" ON "Session"("userId", "expires");

-- CreateIndex
CREATE INDEX "Source_enabled_nextPollAt_idx" ON "Source"("enabled", "nextPollAt");

-- CreateIndex
CREATE INDEX "Source_status_idx" ON "Source"("status");

-- CreateIndex
CREATE INDEX "SourceCredential_sourceId_idx" ON "SourceCredential"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceCheckpoint_sourceId_scope_key" ON "SourceCheckpoint"("sourceId", "scope");

-- CreateIndex
CREATE INDEX "IngestionRun_sourceId_startedAt_idx" ON "IngestionRun"("sourceId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "IngestionRun_status_startedAt_idx" ON "IngestionRun"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentItem_primarySourcePostId_key" ON "ContentItem"("primarySourcePostId");

-- CreateIndex
CREATE INDEX "ContentItem_status_publishedAt_idx" ON "ContentItem"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "ContentItem_rankingScore_publishedAt_idx" ON "ContentItem"("rankingScore" DESC, "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "ContentItem_canonicalUrlHash_idx" ON "ContentItem"("canonicalUrlHash");

-- CreateIndex
CREATE INDEX "ContentItem_duplicateGroupId_idx" ON "ContentItem"("duplicateGroupId");

-- CreateIndex
CREATE INDEX "SourcePost_sourceId_providerPublishedAt_idx" ON "SourcePost"("sourceId", "providerPublishedAt" DESC);

-- CreateIndex
CREATE INDEX "SourcePost_contentItemId_idx" ON "SourcePost"("contentItemId");

-- CreateIndex
CREATE UNIQUE INDEX "SourcePost_sourceId_externalId_key" ON "SourcePost"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "MediaAsset_cacheState_lastAccessedAt_idx" ON "MediaAsset"("cacheState", "lastAccessedAt");

-- CreateIndex
CREATE INDEX "MediaAsset_sha256_idx" ON "MediaAsset"("sha256");

-- CreateIndex
CREATE INDEX "MediaAsset_perceptualHash_idx" ON "MediaAsset"("perceptualHash");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_contentItemId_ordinal_key" ON "MediaAsset"("contentItemId", "ordinal");

-- CreateIndex
CREATE INDEX "UserAction_userId_kind_occurredAt_idx" ON "UserAction"("userId", "kind", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "UserAction_contentItemId_kind_idx" ON "UserAction"("contentItemId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "UserAction_userId_contentItemId_kind_key" ON "UserAction"("userId", "contentItemId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "ContentTag_tagId_contentItemId_idx" ON "ContentTag"("tagId", "contentItemId");

-- CreateIndex
CREATE INDEX "DuplicateLink_toContentId_idx" ON "DuplicateLink"("toContentId");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateLink_fromContentId_toContentId_reason_key" ON "DuplicateLink"("fromContentId", "toContentId", "reason");

-- CreateIndex
CREATE INDEX "AuditEvent_occurredAt_idx" ON "AuditEvent"("occurredAt" DESC);

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_occurredAt_idx" ON "AuditEvent"("actorUserId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "AuditEvent_targetType_targetId_idx" ON "AuditEvent"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceCredential" ADD CONSTRAINT "SourceCredential_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceCheckpoint" ADD CONSTRAINT "SourceCheckpoint_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionRun" ADD CONSTRAINT "IngestionRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_primarySourcePostId_fkey" FOREIGN KEY ("primarySourcePostId") REFERENCES "SourcePost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_duplicateGroupId_fkey" FOREIGN KEY ("duplicateGroupId") REFERENCES "DuplicateGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcePost" ADD CONSTRAINT "SourcePost_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcePost" ADD CONSTRAINT "SourcePost_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAction" ADD CONSTRAINT "UserAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAction" ADD CONSTRAINT "UserAction_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTag" ADD CONSTRAINT "ContentTag_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTag" ADD CONSTRAINT "ContentTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateLink" ADD CONSTRAINT "DuplicateLink_fromContentId_fkey" FOREIGN KEY ("fromContentId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateLink" ADD CONSTRAINT "DuplicateLink_toContentId_fkey" FOREIGN KEY ("toContentId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
