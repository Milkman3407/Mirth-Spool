import { z } from "zod";

import type {
  ContentRating,
  ContentStatus,
  MediaKind,
  Prisma,
  PrismaClient,
} from "../generated/prisma/client.js";
import type { Clock } from "../repository-types.js";
import { systemClock } from "../repository-types.js";
import {
  DISABLED_RAW_PAYLOAD_POLICY,
  prepareRawPayload,
  type RawPayloadPolicy,
} from "../raw-payload.js";

const externalIdSchema = z.string().min(1).max(2_048);
const text = z.string().max(20_000).nullable().optional();
const url = z.url().max(2_048).nullable().optional();

export interface NormalizedMediaInput {
  readonly ordinal: number;
  readonly kind: MediaKind;
  readonly remoteUrl: string;
  readonly canonicalRemoteUrl?: string | null;
  readonly mimeType?: string | null;
  readonly byteLength?: bigint | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly durationMilliseconds?: number | null;
}

export interface NormalizedContentInput {
  readonly sourceId: string;
  readonly externalId: string;
  readonly providerUrl?: string | null;
  readonly providerAuthor?: string | null;
  readonly providerScore?: number | null;
  readonly providerPublishedAt?: Date | null;
  readonly providerUpdatedAt?: Date | null;
  readonly rawPayload?: unknown;
  readonly title?: string | null;
  readonly normalizedTitle?: string | null;
  readonly summary?: string | null;
  readonly authorName?: string | null;
  readonly authorExternalId?: string | null;
  readonly contentRating: ContentRating;
  readonly contentWarning?: string | null;
  readonly status?: ContentStatus;
  readonly publishedAt: Date;
  readonly canonicalUrl?: string | null;
  readonly canonicalUrlHash?: string | null;
  readonly rankingScore?: number;
  readonly media: readonly NormalizedMediaInput[];
}

export interface UpsertNormalizedContentOptions {
  readonly clock?: Clock;
  readonly rawPayloadPolicy?: RawPayloadPolicy;
}

export async function upsertNormalizedContent(
  client: PrismaClient,
  input: NormalizedContentInput,
  options: UpsertNormalizedContentOptions = {},
) {
  const normalized = validateInput(input);
  const clock = options.clock ?? systemClock;
  const rawPayload = prepareRawPayload(
    input.rawPayload,
    options.rawPayloadPolicy ?? DISABLED_RAW_PAYLOAD_POLICY,
  );

  try {
    return await client.$transaction(
      async (transaction) => {
        const existing = await transaction.sourcePost.findUnique({
          where: {
            sourceId_externalId: {
              sourceId: normalized.sourceId,
              externalId: normalized.externalId,
            },
          },
        });

        if (existing !== null) {
          await transaction.sourcePost.update({
            where: { id: existing.id },
            data: occurrenceUpdate(normalized, rawPayload, clock.now()),
          });
          return transaction.contentItem.findUniqueOrThrow({
            where: { id: existing.contentItemId },
            include: {
              mediaAssets: { orderBy: { ordinal: "asc" } },
              sourcePosts: true,
            },
          });
        }

        const contentItem = await transaction.contentItem.create({
          data: {
            ...(normalized.title !== undefined
              ? { title: normalized.title }
              : {}),
            ...(normalized.normalizedTitle !== undefined
              ? { normalizedTitle: normalized.normalizedTitle }
              : {}),
            ...(normalized.summary !== undefined
              ? { summary: normalized.summary }
              : {}),
            ...(normalized.authorName !== undefined
              ? { authorName: normalized.authorName }
              : {}),
            ...(normalized.authorExternalId !== undefined
              ? { authorExternalId: normalized.authorExternalId }
              : {}),
            contentRating: normalized.contentRating,
            ...(normalized.contentWarning !== undefined
              ? { contentWarning: normalized.contentWarning }
              : {}),
            ...(normalized.status !== undefined
              ? { status: normalized.status }
              : {}),
            publishedAt: normalized.publishedAt,
            firstSeenAt: clock.now(),
            lastSeenAt: clock.now(),
            ...(normalized.canonicalUrl !== undefined
              ? { canonicalUrl: normalized.canonicalUrl }
              : {}),
            ...(normalized.canonicalUrlHash !== undefined
              ? { canonicalUrlHash: normalized.canonicalUrlHash }
              : {}),
            ...(normalized.rankingScore !== undefined
              ? { rankingScore: normalized.rankingScore }
              : {}),
          },
        });
        const occurrence = await transaction.sourcePost.create({
          data: {
            ...occurrenceCreate(normalized, rawPayload, clock.now()),
            contentItemId: contentItem.id,
          },
        });
        for (const asset of normalized.media) {
          await transaction.mediaAsset.create({
            data: { ...asset, contentItemId: contentItem.id },
          });
        }
        await transaction.contentItem.update({
          where: { id: contentItem.id },
          data: { primarySourcePostId: occurrence.id },
        });
        return transaction.contentItem.findUniqueOrThrow({
          where: { id: contentItem.id },
          include: {
            mediaAssets: { orderBy: { ordinal: "asc" } },
            sourcePosts: true,
          },
        });
      },
      { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 },
    );
  } catch (error) {
    if (!isUniqueOrSerializationConflict(error)) {
      throw error;
    }
    const existing = await client.sourcePost.findUnique({
      where: {
        sourceId_externalId: {
          sourceId: normalized.sourceId,
          externalId: normalized.externalId,
        },
      },
      include: {
        contentItem: {
          include: {
            mediaAssets: { orderBy: { ordinal: "asc" } },
            sourcePosts: true,
          },
        },
      },
    });
    if (existing === null) {
      throw error;
    }
    return existing.contentItem;
  }
}

function validateInput(input: NormalizedContentInput): NormalizedContentInput {
  externalIdSchema.parse(input.externalId);
  z.uuid().parse(input.sourceId);
  text.parse(input.title);
  text.parse(input.summary);
  url.parse(input.providerUrl);
  url.parse(input.canonicalUrl);
  if (Number.isNaN(input.publishedAt.valueOf())) {
    throw new Error("publishedAt must be a valid UTC instant");
  }
  for (const asset of input.media) {
    z.number().int().min(0).max(100).parse(asset.ordinal);
    z.url().max(2_048).parse(asset.remoteUrl);
  }
  return input;
}

function occurrenceCreate(
  input: NormalizedContentInput,
  rawPayload: ReturnType<typeof prepareRawPayload>,
  now: Date,
): Prisma.SourcePostUncheckedCreateWithoutContentItemInput {
  return {
    sourceId: input.sourceId,
    externalId: input.externalId,
    ...(input.providerUrl !== undefined
      ? { providerUrl: input.providerUrl }
      : {}),
    ...(input.providerAuthor !== undefined
      ? { providerAuthor: input.providerAuthor }
      : {}),
    ...(input.providerScore !== undefined
      ? { providerScore: input.providerScore }
      : {}),
    ...(input.providerPublishedAt !== undefined
      ? { providerPublishedAt: input.providerPublishedAt }
      : {}),
    ...(input.providerUpdatedAt !== undefined
      ? { providerUpdatedAt: input.providerUpdatedAt }
      : {}),
    ...(rawPayload !== null
      ? { rawPayload: rawPayload.value, rawPayloadBytes: rawPayload.bytes }
      : {}),
    firstSeenAt: now,
    lastSeenAt: now,
  };
}

function occurrenceUpdate(
  input: NormalizedContentInput,
  rawPayload: ReturnType<typeof prepareRawPayload>,
  now: Date,
): Prisma.SourcePostUpdateInput {
  return {
    ...(input.providerUrl !== undefined
      ? { providerUrl: input.providerUrl }
      : {}),
    ...(input.providerAuthor !== undefined
      ? { providerAuthor: input.providerAuthor }
      : {}),
    ...(input.providerScore !== undefined
      ? { providerScore: input.providerScore }
      : {}),
    ...(input.providerPublishedAt !== undefined
      ? { providerPublishedAt: input.providerPublishedAt }
      : {}),
    ...(input.providerUpdatedAt !== undefined
      ? { providerUpdatedAt: input.providerUpdatedAt }
      : {}),
    ...(rawPayload !== null
      ? { rawPayload: rawPayload.value, rawPayloadBytes: rawPayload.bytes }
      : {}),
    lastSeenAt: now,
  };
}

function isUniqueOrSerializationConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "P2002" || error.code === "P2034")
  );
}
