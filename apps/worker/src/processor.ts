import { createHash } from "node:crypto";

import {
  ConnectorError,
  type ConnectorHttpClient,
  type ConnectorLogger,
  type ConnectorRegistry,
  type ConnectorTokenCache,
  type HardenedHttpRequest,
  type HardenedHttpResponse,
  connectorPageSchema,
  safeConnectorFailure,
} from "@mirthspool/connectors";
import {
  createCredentialKeyring,
  decryptCredential,
  type CredentialKeyring,
} from "@mirthspool/config/credential-envelope";
import {
  claimIngestionRun,
  finalizeIngestionRun,
  persistIngestionPage,
  type DatabaseClient,
  type NormalizedContentInput,
} from "@mirthspool/db";
import {
  assertSourcePollJobData,
  type SourcePollJobData,
} from "@mirthspool/redis";
import { UnrecoverableError, type Job } from "bullmq";

export interface IngestionLimits {
  readonly maxBytes: number;
  readonly maxDurationMs: number;
  readonly maxItems: number;
  readonly maxPages: number;
  readonly maxRequests: number;
}

export interface ProcessorDependencies {
  readonly database: DatabaseClient;
  readonly http: ConnectorHttpClient;
  readonly keyring: CredentialKeyring;
  readonly limits: IngestionLimits;
  readonly logger: ConnectorLogger;
  readonly now?: () => Date;
  readonly registry: ConnectorRegistry;
  readonly shutdownSignal: AbortSignal;
  readonly tokenCache?: ConnectorTokenCache;
}

export class RetryableIngestionError extends Error {
  constructor(
    readonly code: string,
    readonly retryAfterMilliseconds?: number,
  ) {
    super(code);
    this.name = "RetryableIngestionError";
  }
}

const emptyStats = () => ({
  bytesFetched: 0n,
  itemsCreated: 0,
  itemsSeen: 0,
  itemsSkipped: 0,
  itemsUpdated: 0,
  pagesFetched: 0,
  providerRequests: 0,
});

export function createSourcePollProcessor(dependencies: ProcessorDependencies) {
  return async (
    job: Job<SourcePollJobData>,
  ): Promise<Readonly<Record<string, unknown>>> => {
    const data = assertSourcePollJobData(job.data);
    const now = dependencies.now ?? (() => new Date());
    const startedAt = now();
    const claimed = await claimIngestionRun(dependencies.database, {
      attempt: job.attemptsMade + 1,
      jobId: String(job.id ?? "unknown-job"),
      sourceId: data.sourceId,
      staleBefore: new Date(
        startedAt.valueOf() - dependencies.limits.maxDurationMs * 2,
      ),
      startedAt,
      trigger: job.attemptsMade > 0 ? "RETRY" : data.trigger,
    });
    if (!claimed) return Object.freeze({ coalesced: true });

    const stats = emptyStats();
    const controller = new AbortController();
    const abortForShutdown = () => controller.abort("worker shutdown");
    dependencies.shutdownSignal.addEventListener("abort", abortForShutdown, {
      once: true,
    });
    const durationTimer = setTimeout(
      () => controller.abort("run duration exceeded"),
      dependencies.limits.maxDurationMs,
    );
    const credentials: Record<string, unknown> = {};
    try {
      for (const credential of claimed.source.credentials) {
        credentials[credential.label] = decryptCredential(
          credential.encryptedPayload,
          {
            kind: credential.kind,
            label: credential.label,
            sourceId: claimed.source.id,
          },
          dependencies.keyring,
        );
      }
      const connector = dependencies.registry.require(claimed.source.kind);
      const http = boundedHttp(dependencies.http, stats, dependencies.limits);
      let checkpoint: unknown =
        claimed.source.checkpoints[0]?.valueJson ?? null;
      let hasMore = true;
      let rateLimitResetAt: Date | undefined;
      while (hasMore) {
        assertWithinLimits(controller.signal, stats, dependencies.limits);
        if (stats.pagesFetched >= dependencies.limits.maxPages) {
          throw new ConnectorError("PERMANENT", { code: "SOURCE_PAGE_LIMIT" });
        }
        const page = connectorPageSchema.parse(
          await connector.fetchPage(
            {
              abortSignal: controller.signal,
              clock: { now },
              credentials,
              http,
              limits: dependencies.limits,
              logger: dependencies.logger,
              ...(dependencies.tokenCache
                ? { tokenCache: dependencies.tokenCache }
                : {}),
            },
            claimed.source.configJson,
            checkpoint,
          ),
        );
        if (
          stats.itemsSeen + page.posts.length >
          dependencies.limits.maxItems
        ) {
          throw new ConnectorError("PERMANENT", { code: "SOURCE_ITEM_LIMIT" });
        }
        const persisted = await persistIngestionPage(
          dependencies.database,
          {
            checkpoint: page.nextCheckpoint,
            items: page.posts.map((post) =>
              normalizedContent(claimed.source, post),
            ),
            sourceId: claimed.source.id,
          },
          now(),
        );
        stats.pagesFetched += 1;
        stats.itemsSeen += page.posts.length;
        stats.itemsCreated += persisted.created;
        stats.itemsUpdated += persisted.updated;
        checkpoint = page.nextCheckpoint;
        hasMore = page.hasMore;
        if (page.rateLimit?.remaining === 0 && page.rateLimit.resetAt) {
          const reset = new Date(page.rateLimit.resetAt);
          if (!rateLimitResetAt || reset > rateLimitResetAt)
            rateLimitResetAt = reset;
        }
        if (hasMore && checkpoint === null) {
          throw new ConnectorError("MALFORMED_RESPONSE", {
            code: "SOURCE_CHECKPOINT_MISSING",
          });
        }
      }
      const finishedAt = now();
      await finalizeIngestionRun(dependencies.database, {
        finishedAt,
        nextPollAt: new Date(
          Math.max(
            finishedAt.valueOf() + claimed.source.pollIntervalSeconds * 1_000,
            rateLimitResetAt?.valueOf() ?? 0,
          ),
        ),
        ...(rateLimitResetAt ? { rateLimitResetAt } : {}),
        runId: claimed.run.id,
        sourceStatus: "ACTIVE",
        stats,
        status: "SUCCEEDED",
        succeeded: true,
      });
      return Object.freeze({
        runId: claimed.run.id,
        ...stats,
        bytesFetched: stats.bytesFetched.toString(),
      });
    } catch (error) {
      const cancelled =
        controller.signal.aborted && dependencies.shutdownSignal.aborted;
      const safe = cancelled
        ? {
            code: "RUN_CANCELLED",
            kind: "PERMANENT" as const,
            message: "The source poll was cancelled.",
          }
        : safeConnectorFailure(error);
      const finishedAt = now();
      const retryable =
        !cancelled && ["RATE_LIMITED", "TRANSIENT"].includes(safe.kind);
      const retryDelay = retryDelayMilliseconds(
        claimed.source.id,
        job.attemptsMade + 1,
        safe.retryAfterSeconds,
      );
      await finalizeIngestionRun(dependencies.database, {
        errorCode: safe.code,
        errorMessage: safe.message,
        finishedAt,
        nextPollAt: new Date(
          finishedAt.valueOf() +
            (retryable
              ? retryDelay
              : claimed.source.pollIntervalSeconds * 1_000),
        ),
        ...(safe.retryAfterSeconds === undefined
          ? {}
          : { rateLimitResetAt: new Date(finishedAt.valueOf() + retryDelay) }),
        runId: claimed.run.id,
        sourceStatus: sourceStatusFor(safe.kind),
        stats,
        status: cancelled ? "CANCELLED" : "FAILED",
        succeeded: false,
      });
      if (retryable) throw new RetryableIngestionError(safe.code, retryDelay);
      throw new UnrecoverableError(safe.code);
    } finally {
      clearTimeout(durationTimer);
      dependencies.shutdownSignal.removeEventListener(
        "abort",
        abortForShutdown,
      );
      for (const label of Object.keys(credentials)) delete credentials[label];
    }
  };
}

export function retryDelayMilliseconds(
  sourceId: string,
  attempt: number,
  retryAfterSeconds?: number,
): number {
  if (retryAfterSeconds !== undefined)
    return Math.min(86_400_000, retryAfterSeconds * 1_000);
  const base = Math.min(300_000, 5_000 * 2 ** Math.max(0, attempt - 1));
  const jitter =
    createHash("sha256")
      .update(`${sourceId}:${attempt}`)
      .digest()
      .readUInt16BE(0) % 1_001;
  return base + jitter;
}

export function sourceBackoffStrategy(
  attemptsMade: number,
  type: string | undefined,
  error?: Error,
): number {
  if (type !== "source-exponential") return -1;
  if (
    error instanceof RetryableIngestionError &&
    error.retryAfterMilliseconds !== undefined
  ) {
    return error.retryAfterMilliseconds;
  }
  return Math.min(300_000, 5_000 * 2 ** Math.max(0, attemptsMade - 1));
}

function boundedHttp(
  delegate: ConnectorHttpClient,
  stats: ReturnType<typeof emptyStats>,
  limits: IngestionLimits,
): ConnectorHttpClient {
  return Object.freeze({
    request: async (
      input: HardenedHttpRequest,
    ): Promise<HardenedHttpResponse> => {
      if (stats.providerRequests >= limits.maxRequests) {
        throw new ConnectorError("PERMANENT", { code: "SOURCE_REQUEST_LIMIT" });
      }
      stats.providerRequests += 1;
      const response = await delegate.request(input);
      stats.bytesFetched += BigInt(response.body.byteLength);
      if (stats.bytesFetched > BigInt(limits.maxBytes)) {
        throw new ConnectorError("PERMANENT", { code: "SOURCE_BYTE_LIMIT" });
      }
      return response;
    },
  });
}

function assertWithinLimits(
  signal: AbortSignal,
  stats: ReturnType<typeof emptyStats>,
  limits: IngestionLimits,
): void {
  if (signal.aborted)
    throw new ConnectorError("TRANSIENT", { code: "SOURCE_RUN_TIMEOUT" });
  if (
    stats.providerRequests > limits.maxRequests ||
    stats.bytesFetched > BigInt(limits.maxBytes)
  ) {
    throw new ConnectorError("PERMANENT", { code: "SOURCE_RUN_LIMIT" });
  }
}

function sourceStatusFor(
  kind: string,
): "AUTH_ERROR" | "CONFIG_ERROR" | "DEGRADED" {
  if (kind === "AUTHENTICATION") return "AUTH_ERROR";
  if (["CONFIGURATION", "NOT_FOUND", "PERMANENT"].includes(kind))
    return "CONFIG_ERROR";
  return "DEGRADED";
}

function normalizedContent(
  source: {
    readonly defaultContentRating: "ADULT" | "SAFE" | "SENSITIVE" | "UNKNOWN";
    readonly id: string;
  },
  post: ReturnType<typeof connectorPageSchema.parse>["posts"][number],
): NormalizedContentInput {
  return {
    authorName: post.authorName,
    canonicalUrl: post.originalUrl,
    canonicalUrlHash: createHash("sha256")
      .update(post.originalUrl)
      .digest("hex"),
    contentRating:
      post.contentRating === "UNKNOWN"
        ? source.defaultContentRating
        : post.contentRating,
    contentWarning: post.contentWarning,
    boostedBy: post.boostedBy,
    communityName: post.communityName,
    externalId: post.externalId,
    media: post.media.map((media, ordinal) => ({
      altText: media.altText,
      byteLength: media.byteLength === null ? null : BigInt(media.byteLength),
      durationMilliseconds: media.durationMilliseconds,
      height: media.height,
      kind: media.kind,
      mimeType: media.mimeType,
      ordinal,
      remoteUrl: media.remoteUrl,
      width: media.width,
    })),
    normalizedTitle: post.title?.trim().toLocaleLowerCase() ?? null,
    providerAuthor: post.authorName,
    providerCommentCount: post.providerCommentCount,
    providerFavouriteCount: post.providerFavouriteCount,
    providerLanguage: post.providerLanguage,
    providerPublishedAt: new Date(post.providerCreatedAt),
    providerDeletedAt: post.providerDeletedAt
      ? new Date(post.providerDeletedAt)
      : null,
    providerScore: post.providerScore,
    providerShareCount: post.providerShareCount,
    providerUpdatedAt: post.providerUpdatedAt
      ? new Date(post.providerUpdatedAt)
      : null,
    providerUrl: post.originalUrl,
    publishedAt: new Date(post.providerCreatedAt),
    status: post.providerDeletedAt ? "REMOVED_AT_SOURCE" : "ACTIVE",
    sourceId: source.id,
    summary: post.summary,
    title: post.title,
  };
}

export { createCredentialKeyring };
