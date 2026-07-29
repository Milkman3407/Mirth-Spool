import { z } from "zod";

import type { Prisma, SourceKind } from "../generated/prisma/client.js";
import type { Clock, RepositoryClient } from "../repository-types.js";
import { systemClock } from "../repository-types.js";

const sourceInputSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200),
    kind: z.enum(["RSS", "LEMMY", "MASTODON", "REDDIT", "IFUNNY"]),
    priority: z.number().int().min(-100).max(100).default(0),
    pollIntervalSeconds: z.number().int().min(60).max(86_400).default(900),
    configJson: z.record(z.string(), z.json()),
  })
  .superRefine((value, context) => {
    findSecretKeys(value.configJson).forEach((path) =>
      context.addIssue({
        code: "custom",
        message: "source configuration must not contain secrets",
        path: ["configJson", ...path],
      }),
    );
  });

const forbiddenConfigKey =
  /authorization|cookie|credential|password|secret|token/i;

export interface CreateSourceInput {
  readonly displayName: string;
  readonly kind: SourceKind;
  readonly priority?: number;
  readonly pollIntervalSeconds?: number;
  readonly configJson: Record<string, Prisma.InputJsonValue>;
}

export async function createSource(
  client: RepositoryClient,
  input: CreateSourceInput,
) {
  const parsed = sourceInputSchema.parse(input);
  return client.source.create({ data: parsed });
}

export function listSources(client: RepositoryClient) {
  return client.source.findMany({
    orderBy: [{ priority: "desc" }, { id: "asc" }],
  });
}

export async function updateSourceHealth(
  client: RepositoryClient,
  input: {
    readonly sourceId: string;
    readonly succeeded: boolean;
    readonly errorCode?: string;
    readonly errorMessage?: string;
  },
  clock: Clock = systemClock,
) {
  const now = clock.now();
  return client.source.update({
    where: { id: input.sourceId },
    data: input.succeeded
      ? {
          consecutiveFailures: 0,
          lastAttemptAt: now,
          lastSuccessAt: now,
          lastErrorCode: null,
          lastErrorMessage: null,
          status: "ACTIVE",
        }
      : {
          consecutiveFailures: { increment: 1 },
          lastAttemptAt: now,
          lastErrorCode: input.errorCode?.slice(0, 100) ?? "INGESTION_FAILED",
          lastErrorMessage: input.errorMessage?.slice(0, 500) ?? null,
          status: "DEGRADED",
        },
  });
}

export function saveSourceCheckpoint(
  client: RepositoryClient,
  input: {
    readonly sourceId: string;
    readonly scope: string;
    readonly value: Prisma.InputJsonValue;
  },
) {
  const scope = z.string().trim().min(1).max(100).parse(input.scope);
  return client.sourceCheckpoint.upsert({
    where: { sourceId_scope: { sourceId: input.sourceId, scope } },
    create: { sourceId: input.sourceId, scope, valueJson: input.value },
    update: { valueJson: input.value },
  });
}

function findSecretKeys(
  value: unknown,
  path: readonly string[] = [],
): readonly (readonly string[])[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      findSecretKeys(entry, [...path, String(index)]),
    );
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([key, entry]) =>
    forbiddenConfigKey.test(key)
      ? [[...path, key]]
      : findSecretKeys(entry, [...path, key]),
  );
}
