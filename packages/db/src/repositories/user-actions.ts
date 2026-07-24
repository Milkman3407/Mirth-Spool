import { z } from "zod";

import type {
  ActionKind,
  ContentRating,
  Prisma,
  PrismaClient,
} from "../generated/prisma/client.js";
import type { Clock, RepositoryClient } from "../repository-types.js";
import { systemClock } from "../repository-types.js";

export const VIEW_COALESCE_MILLISECONDS = 15 * 60 * 1_000;

export type LibraryKind = "favorites" | "hidden" | "history";

export interface LibraryPosition {
  readonly id: string;
  readonly timestamp: Date;
}

export interface LibraryQuery {
  readonly allowedRatings: readonly ContentRating[];
  readonly kind: LibraryKind;
  readonly limit: number;
  readonly position?: LibraryPosition;
  readonly userId: string;
}

export async function setUserAction(
  client: RepositoryClient,
  input: {
    readonly contentItemId: string;
    readonly kind: "FAVORITE" | "HIDE";
    readonly userId: string;
  },
  clock: Clock = systemClock,
) {
  validateActionIdentity(input);
  const now = clock.now();
  const where = {
    userId_contentItemId_kind: {
      contentItemId: input.contentItemId,
      kind: input.kind,
      userId: input.userId,
    },
  } as const;
  try {
    return await client.userAction.upsert({
      where,
      create: {
        contentItemId: input.contentItemId,
        kind: input.kind,
        lastOccurredAt: now,
        occurredAt: now,
        userId: input.userId,
      },
      update: {},
    });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    return client.userAction.findUniqueOrThrow({ where });
  }
}

export function removeUserAction(
  client: RepositoryClient,
  input: {
    readonly contentItemId: string;
    readonly kind: ActionKind;
    readonly userId: string;
  },
) {
  validateActionIdentity(input);
  return client.userAction.deleteMany({ where: input });
}

export async function recordMeaningfulView(
  client: PrismaClient,
  input: { readonly contentItemId: string; readonly userId: string },
  clock: Clock = systemClock,
) {
  validateActionIdentity(input);
  const now = clock.now();
  const threshold = new Date(now.valueOf() - VIEW_COALESCE_MILLISECONDS);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await client.$transaction(
        async (transaction) => {
          const key = {
            userId_contentItemId_kind: {
              contentItemId: input.contentItemId,
              kind: "VIEW" as const,
              userId: input.userId,
            },
          };
          const existing = await transaction.userAction.findUnique({
            where: key,
          });
          if (!existing) {
            return transaction.userAction.create({
              data: {
                ...key.userId_contentItemId_kind,
                lastOccurredAt: now,
                occurredAt: now,
                occurrenceCount: 1,
              },
            });
          }
          if (existing.lastOccurredAt > threshold) return existing;
          return transaction.userAction.update({
            data: {
              lastOccurredAt: now,
              occurrenceCount: { increment: 1 },
            },
            where: { id: existing.id },
          });
        },
        { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 },
      );
    } catch (error) {
      if (!isRetryableConflict(error) || attempt === 2) throw error;
    }
  }
  throw new Error("VIEW_RECORDING_CONFLICT");
}

export async function readUserActionState(
  client: RepositoryClient,
  input: { readonly contentItemId: string; readonly userId: string },
) {
  validateActionIdentity(input);
  return client.userAction.findMany({
    orderBy: { kind: "asc" },
    select: {
      kind: true,
      lastOccurredAt: true,
      occurredAt: true,
      occurrenceCount: true,
    },
    where: input,
  });
}

export async function queryLibrary(client: PrismaClient, input: LibraryQuery) {
  z.number().int().min(1).max(50).parse(input.limit);
  z.uuid().parse(input.userId);
  const actionKind = actionKindFor(input.kind);
  const timestampField =
    actionKind === "VIEW" ? "lastOccurredAt" : "occurredAt";
  const position = input.position;
  const rows = await client.userAction.findMany({
    include: {
      contentItem: {
        include: contentPresentationInclude(input.userId),
      },
    },
    orderBy: [{ [timestampField]: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    where: {
      ...(position
        ? {
            OR: [
              { [timestampField]: { lt: position.timestamp } },
              { id: { lt: position.id }, [timestampField]: position.timestamp },
            ],
          }
        : {}),
      contentItem: {
        contentRating: { in: [...input.allowedRatings] },
        status: { not: "SUPPRESSED" },
      },
      kind: actionKind,
      userId: input.userId,
    },
  });
  return Object.freeze({
    hasMore: rows.length > input.limit,
    rows: rows.slice(0, input.limit),
  });
}

export function contentPresentationInclude(userId: string) {
  const actionSelection = {
    orderBy: { kind: "asc" as const },
    select: {
      kind: true,
      lastOccurredAt: true,
      occurredAt: true,
      occurrenceCount: true,
    },
    where: { userId },
  };
  return {
    actions: actionSelection,
    duplicateGroup: {
      select: {
        id: true,
        items: {
          orderBy: [
            { duplicatePrimary: "desc" as const },
            { id: "asc" as const },
          ],
          select: {
            actions: actionSelection,
            id: true,
            sourcePosts: {
              include: {
                source: {
                  select: { displayName: true, id: true, kind: true },
                },
              },
              orderBy: [
                { firstSeenAt: "asc" as const },
                { id: "asc" as const },
              ],
              take: 20,
            },
            tags: {
              include: { tag: true },
              orderBy: { tagId: "asc" as const },
            },
          },
          take: 50,
        },
        primaryContentId: true,
      },
    },
    mediaAssets: {
      orderBy: [{ ordinal: "asc" as const }, { id: "asc" as const }],
    },
    primarySourcePost: {
      include: {
        source: {
          select: { displayName: true, id: true, kind: true, priority: true },
        },
      },
    },
    sourcePosts: { select: { id: true } },
    tags: { include: { tag: true }, orderBy: { tagId: "asc" as const } },
  } satisfies Prisma.ContentItemInclude;
}

function actionKindFor(kind: LibraryKind): ActionKind {
  if (kind === "favorites") return "FAVORITE";
  if (kind === "hidden") return "HIDE";
  return "VIEW";
}

function validateActionIdentity(input: {
  readonly contentItemId: string;
  readonly userId: string;
}) {
  z.uuid().parse(input.contentItemId);
  z.uuid().parse(input.userId);
}

function isRetryableConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
