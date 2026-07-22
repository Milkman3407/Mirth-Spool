import {
  type ConnectorHttpClient,
  type ConnectorLogger,
  type ConnectorRegistry,
  type ConnectorTokenCache,
  type HardenedHttpRequest,
  redditCredentialSchema,
  type SourceKind,
} from "@mirthspool/connectors";
import { safeConnectorFailure } from "@mirthspool/connectors/errors";
import { connectivityResultSchema } from "@mirthspool/connectors/schemas";
import type { DatabaseClient } from "@mirthspool/db";
import { listIngestionRuns } from "@mirthspool/db/ingestion";
import {
  enqueueSourcePoll,
  type SourcePollEnqueuer,
} from "@mirthspool/redis/queues";

import {
  createCredentialKeyring,
  decryptCredential,
  encryptCredential,
  type CredentialKeyring,
} from "./credential-envelope";
import type {
  CreateSourceInput,
  CredentialInput,
  UpdateSourceInput,
} from "./schemas";
import { sourceConfigSchema } from "./schemas";

export class SourceServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SourceServiceError";
  }
}

export interface SourceServiceDependencies {
  readonly database: DatabaseClient;
  readonly http: ConnectorHttpClient;
  readonly keyring: CredentialKeyring;
  readonly logger: ConnectorLogger;
  readonly now?: () => Date;
  readonly registry: ConnectorRegistry;
  readonly tokenCache?: ConnectorTokenCache;
}

export function sourceServiceKeyring(
  version: number,
  key: Uint8Array,
): CredentialKeyring {
  return createCredentialKeyring(version, key);
}

const sourceSelection = {
  configJson: true,
  consecutiveFailures: true,
  createdAt: true,
  credentials: {
    select: { id: true, kind: true, label: true, updatedAt: true },
  },
  defaultContentRating: true,
  deletedAt: true,
  displayName: true,
  enabled: true,
  id: true,
  kind: true,
  lastAttemptAt: true,
  lastErrorCode: true,
  lastErrorMessage: true,
  lastSuccessAt: true,
  minimumScore: true,
  nextPollAt: true,
  pollIntervalSeconds: true,
  priority: true,
  status: true,
  updatedAt: true,
} as const;

function sanitizedSource<T extends Record<string, unknown>>(
  source: T,
): Omit<T, "deletedAt"> {
  const { deletedAt, ...safe } = source;
  void deletedAt;
  return safe;
}

function validateConnectorConfig(
  registry: ConnectorRegistry,
  kind: SourceKind,
  config: Readonly<Record<string, unknown>>,
  enabled: boolean,
): CreateSourceInput["config"] {
  const connector = registry.get(kind);
  if (connector)
    return sourceConfigSchema.parse(connector.validateConfig(config));
  if (enabled) {
    throw new SourceServiceError(
      "SOURCE_CONNECTOR_UNAVAILABLE",
      "This connector is not available yet; save it as a paused placeholder.",
      409,
    );
  }
  if (Object.keys(config).length > 0) {
    throw new SourceServiceError(
      "SOURCE_CONFIG_UNAVAILABLE",
      "Configuration can be added after this connector becomes available.",
      409,
    );
  }
  return {};
}

export async function listManagedSources(
  dependencies: SourceServiceDependencies,
) {
  const sources = await dependencies.database.source.findMany({
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    select: sourceSelection,
    take: 100,
    where: { deletedAt: null },
  });
  return sources.map(sanitizedSource);
}

export async function readManagedSource(
  dependencies: SourceServiceDependencies,
  sourceId: string,
) {
  const source = await dependencies.database.source.findFirst({
    select: sourceSelection,
    where: { deletedAt: null, id: sourceId },
  });
  if (!source) {
    throw new SourceServiceError(
      "SOURCE_NOT_FOUND",
      "The source was not found.",
      404,
    );
  }
  return sanitizedSource(source);
}

export async function enqueueManualSourceRefresh(
  dependencies: SourceServiceDependencies,
  queue: SourcePollEnqueuer,
  actorUserId: string,
  sourceId: string,
  correlationId?: string,
) {
  const source = await readManagedSource(dependencies, sourceId);
  if (!source.enabled) {
    throw new SourceServiceError(
      "SOURCE_PAUSED",
      "Resume the source before requesting a refresh.",
      409,
    );
  }
  if (!dependencies.registry.get(source.kind)) {
    throw new SourceServiceError(
      "SOURCE_CONNECTOR_UNAVAILABLE",
      "This source connector is not available.",
      409,
    );
  }
  const requestedAt = dependencies.now?.() ?? new Date();
  const reference = await enqueueSourcePoll(queue, {
    ...(correlationId ? { correlationId } : {}),
    requestedAt: requestedAt.toISOString(),
    sourceId,
    trigger: "MANUAL",
  });
  await dependencies.database.auditEvent.create({
    data: {
      actorUserId,
      eventType: "SOURCE_REFRESH_ENQUEUED",
      metadataJson: { correlationId, jobId: reference.id },
      targetId: sourceId,
      targetType: "Source",
    },
  });
  return reference;
}

export async function listManagedSourceRuns(
  dependencies: SourceServiceDependencies,
  sourceId: string,
  input: { readonly cursor?: string; readonly limit: number },
) {
  await readManagedSource(dependencies, sourceId);
  const rows = await listIngestionRuns(dependencies.database, {
    ...input,
    sourceId,
  });
  return Object.freeze({
    items: rows.map((run) => ({
      ...run,
      bytesFetched: run.bytesFetched.toString(),
    })),
    nextCursor: rows.length === input.limit ? (rows.at(-1)?.id ?? null) : null,
  });
}

export async function createManagedSource(
  dependencies: SourceServiceDependencies,
  actorUserId: string,
  input: CreateSourceInput,
) {
  const config = validateConnectorConfig(
    dependencies.registry,
    input.kind,
    input.config,
    input.enabled,
  );
  return dependencies.database.$transaction(async (transaction) => {
    const source = await transaction.source.create({
      data: {
        configJson: config,
        defaultContentRating: input.defaultContentRating,
        displayName: input.displayName,
        enabled: input.enabled,
        kind: input.kind,
        minimumScore: input.minimumScore,
        pollIntervalSeconds: input.pollIntervalSeconds,
        priority: input.priority,
        status: input.enabled ? "ACTIVE" : "PAUSED",
      },
      select: sourceSelection,
    });
    await transaction.auditEvent.create({
      data: {
        actorUserId,
        eventType: "SOURCE_CREATED",
        metadataJson: { kind: input.kind },
        targetId: source.id,
        targetType: "Source",
      },
    });
    return sanitizedSource(source);
  });
}

export async function updateManagedSource(
  dependencies: SourceServiceDependencies,
  actorUserId: string,
  sourceId: string,
  input: UpdateSourceInput,
) {
  const existing = await readManagedSource(dependencies, sourceId);
  const config =
    input.config === undefined
      ? undefined
      : validateConnectorConfig(
          dependencies.registry,
          existing.kind,
          input.config,
          existing.enabled,
        );
  return dependencies.database.$transaction(async (transaction) => {
    const source = await transaction.source.update({
      data: {
        ...(config === undefined ? {} : { configJson: config }),
        ...(input.defaultContentRating === undefined
          ? {}
          : { defaultContentRating: input.defaultContentRating }),
        ...(input.displayName === undefined
          ? {}
          : { displayName: input.displayName }),
        ...(input.minimumScore === undefined
          ? {}
          : { minimumScore: input.minimumScore }),
        ...(input.pollIntervalSeconds === undefined
          ? {}
          : { pollIntervalSeconds: input.pollIntervalSeconds }),
        ...(input.priority === undefined ? {} : { priority: input.priority }),
      },
      select: sourceSelection,
      where: { id: sourceId },
    });
    await transaction.auditEvent.create({
      data: {
        actorUserId,
        eventType: "SOURCE_UPDATED",
        metadataJson: { fields: Object.keys(input).sort() },
        targetId: sourceId,
        targetType: "Source",
      },
    });
    return sanitizedSource(source);
  });
}

export async function setSourcePaused(
  dependencies: SourceServiceDependencies,
  actorUserId: string,
  sourceId: string,
  paused: boolean,
) {
  const existing = await readManagedSource(dependencies, sourceId);
  if (!paused && !dependencies.registry.get(existing.kind)) {
    throw new SourceServiceError(
      "SOURCE_CONNECTOR_UNAVAILABLE",
      "This connector cannot be resumed until its provider module is installed.",
      409,
    );
  }
  return dependencies.database.$transaction(async (transaction) => {
    const source = await transaction.source.update({
      data: { enabled: !paused, status: paused ? "PAUSED" : "ACTIVE" },
      select: sourceSelection,
      where: { id: sourceId },
    });
    await transaction.auditEvent.create({
      data: {
        actorUserId,
        eventType: paused ? "SOURCE_PAUSED" : "SOURCE_RESUMED",
        targetId: sourceId,
        targetType: "Source",
      },
    });
    return sanitizedSource(source);
  });
}

export async function softDeleteManagedSource(
  dependencies: SourceServiceDependencies,
  actorUserId: string,
  sourceId: string,
) {
  const existing = await dependencies.database.source.findUnique({
    select: { deletedAt: true, id: true },
    where: { id: sourceId },
  });
  if (!existing) {
    throw new SourceServiceError(
      "SOURCE_NOT_FOUND",
      "The source was not found.",
      404,
    );
  }
  if (existing.deletedAt) return { deleted: true } as const;
  const now = dependencies.now?.() ?? new Date();
  await dependencies.database.$transaction([
    dependencies.database.source.update({
      data: { deletedAt: now, enabled: false, status: "PAUSED" },
      where: { id: sourceId },
    }),
    dependencies.database.auditEvent.create({
      data: {
        actorUserId,
        eventType: "SOURCE_DELETED",
        targetId: sourceId,
        targetType: "Source",
      },
    }),
  ]);
  return { deleted: true } as const;
}

export async function rotateSourceCredential(
  dependencies: SourceServiceDependencies,
  actorUserId: string,
  sourceId: string,
  input: CredentialInput,
) {
  const source = await readManagedSource(dependencies, sourceId);
  if (source.kind === "REDDIT") {
    if (input.kind !== "OAUTH_CLIENT" || input.label !== "primary") {
      throw new SourceServiceError(
        "SOURCE_REDDIT_CREDENTIAL_INVALID",
        "Reddit requires the primary OAuth client credential.",
        422,
      );
    }
    const parsed = redditCredentialSchema.safeParse(input.payload);
    if (!parsed.success) {
      throw new SourceServiceError(
        "SOURCE_REDDIT_CREDENTIAL_INVALID",
        "The Reddit OAuth client credential is invalid.",
        422,
      );
    }
    input = { ...input, payload: parsed.data };
  }
  const binding = { kind: input.kind, label: input.label, sourceId };
  const encryptedPayload = Buffer.from(
    encryptCredential(input.payload, binding, dependencies.keyring),
  );
  return dependencies.database.$transaction(async (transaction) => {
    const credential = await transaction.sourceCredential.upsert({
      create: {
        encryptedPayload,
        keyVersion: dependencies.keyring.currentVersion,
        kind: input.kind,
        label: input.label,
        sourceId,
      },
      select: { id: true, kind: true, label: true, updatedAt: true },
      update: {
        encryptedPayload,
        keyVersion: dependencies.keyring.currentVersion,
      },
      where: {
        sourceId_kind_label: { kind: input.kind, label: input.label, sourceId },
      },
    });
    await transaction.auditEvent.create({
      data: {
        actorUserId,
        eventType: "SOURCE_CREDENTIAL_ROTATED",
        metadataJson: { kind: input.kind, label: input.label },
        targetId: sourceId,
        targetType: "Source",
      },
    });
    return credential;
  });
}

export async function validateManagedSource(
  dependencies: SourceServiceDependencies,
  actorUserId: string,
  sourceId: string,
  abortSignal: AbortSignal,
) {
  const source = await dependencies.database.source.findFirst({
    include: { credentials: true },
    where: { deletedAt: null, id: sourceId },
  });
  if (!source) {
    throw new SourceServiceError(
      "SOURCE_NOT_FOUND",
      "The source was not found.",
      404,
    );
  }
  const connector = dependencies.registry.get(source.kind);
  if (!connector) {
    return Object.freeze({
      code: "SOURCE_CONNECTOR_UNAVAILABLE",
      message: "This connector is not available yet.",
      ok: false as const,
    });
  }
  const credentialValues: Record<string, unknown> = {};
  for (const credential of source.credentials) {
    credentialValues[credential.label] = decryptCredential(
      credential.encryptedPayload,
      { kind: credential.kind, label: credential.label, sourceId },
      dependencies.keyring,
    );
  }
  let requestCount = 0;
  const boundedHttp: ConnectorHttpClient = Object.freeze({
    request: async (input: HardenedHttpRequest) => {
      requestCount += 1;
      if (requestCount > 3) {
        throw new SourceServiceError(
          "SOURCE_VALIDATION_LIMIT",
          "Source validation exceeded its request limit.",
          422,
        );
      }
      return dependencies.http.request(input);
    },
  });
  const now = dependencies.now ?? (() => new Date());
  try {
    const result = connectivityResultSchema.parse(
      await connector.validateConnectivity(
        {
          abortSignal,
          clock: { now },
          credentials: credentialValues,
          http: boundedHttp,
          limits: {
            maxBytes: 5_000_000,
            maxItems: 0,
            maxPages: 0,
            maxRequests: 3,
          },
          logger: dependencies.logger,
          ...(dependencies.tokenCache
            ? { tokenCache: dependencies.tokenCache }
            : {}),
        },
        source.configJson,
      ),
    );
    await dependencies.database.$transaction([
      dependencies.database.source.update({
        data: result.ok
          ? {
              consecutiveFailures: 0,
              lastAttemptAt: now(),
              lastErrorCode: null,
              lastErrorMessage: null,
              lastSuccessAt: now(),
              status: source.enabled ? "ACTIVE" : "PAUSED",
            }
          : {
              lastAttemptAt: now(),
              lastErrorCode: result.code,
              lastErrorMessage: result.message,
              status: source.enabled ? "CONFIG_ERROR" : "PAUSED",
            },
        where: { id: sourceId },
      }),
      dependencies.database.auditEvent.create({
        data: {
          actorUserId,
          eventType: "SOURCE_VALIDATED",
          metadataJson: { code: result.ok ? null : result.code, ok: result.ok },
          targetId: sourceId,
          targetType: "Source",
        },
      }),
    ]);
    return result;
  } catch (error) {
    if (error instanceof SourceServiceError) throw error;
    const safe = safeConnectorFailure(error);
    await dependencies.database.$transaction([
      dependencies.database.source.update({
        data: {
          lastAttemptAt: now(),
          lastErrorCode: safe.code,
          lastErrorMessage: safe.message,
          status:
            source.enabled && safe.kind === "AUTHENTICATION"
              ? "AUTH_ERROR"
              : source.enabled
                ? "DEGRADED"
                : "PAUSED",
        },
        where: { id: sourceId },
      }),
      dependencies.database.auditEvent.create({
        data: {
          actorUserId,
          eventType: "SOURCE_VALIDATED",
          metadataJson: { code: safe.code, ok: false },
          targetId: sourceId,
          targetType: "Source",
        },
      }),
    ]);
    return Object.freeze({
      code: safe.code,
      message: safe.message,
      ok: false as const,
      ...(safe.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: safe.retryAfterSeconds }),
    });
  } finally {
    for (const label of Object.keys(credentialValues))
      delete credentialValues[label];
  }
}
