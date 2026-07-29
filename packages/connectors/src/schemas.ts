import { z } from "zod";

export const sourceKindSchema = z.enum([
  "RSS",
  "LEMMY",
  "MASTODON",
  "REDDIT",
  "IFUNNY",
]);

export const mediaKindSchema = z.enum([
  "IMAGE",
  "ANIMATED_IMAGE",
  "VIDEO",
  "LINK",
]);

export const contentRatingSchema = z.enum([
  "SAFE",
  "SENSITIVE",
  "ADULT",
  "UNKNOWN",
]);

const httpUrlSchema = z
  .url()
  .max(2_048)
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "URL must use HTTP or HTTPS",
  });

export const normalizedMediaAssetSchema = z
  .object({
    altText: z.string().max(1_000).nullable().default(null),
    byteLength: z
      .number()
      .int()
      .nonnegative()
      .max(250_000_000)
      .nullable()
      .default(null),
    durationMilliseconds: z
      .number()
      .int()
      .nonnegative()
      .max(86_400_000)
      .nullable()
      .default(null),
    height: z.number().int().positive().max(32_768).nullable().default(null),
    kind: mediaKindSchema,
    mimeType: z.string().trim().max(200).nullable().default(null),
    previewUrl: httpUrlSchema.nullable().default(null),
    remoteUrl: httpUrlSchema,
    width: z.number().int().positive().max(32_768).nullable().default(null),
  })
  .strict();

export const normalizedSourcePostSchema = z
  .object({
    authorName: z.string().trim().max(500).nullable().default(null),
    boostedBy: z.string().trim().max(500).nullable().default(null),
    categories: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
    communityName: z.string().trim().max(500).nullable().default(null),
    contentRating: contentRatingSchema.default("UNKNOWN"),
    contentWarning: z.string().trim().max(2_000).nullable().default(null),
    externalId: z.string().trim().min(1).max(1_024),
    media: z.array(normalizedMediaAssetSchema).max(20).default([]),
    originalUrl: httpUrlSchema,
    providerCommentCount: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .default(null),
    providerFavouriteCount: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .default(null),
    providerLanguage: z.string().trim().max(35).nullable().default(null),
    providerShareCount: z.number().int().nonnegative().nullable().default(null),
    providerCreatedAt: z.iso.datetime({ offset: true }),
    providerDeletedAt: z.iso
      .datetime({ offset: true })
      .nullable()
      .default(null),
    providerScore: z.number().int().nullable().default(null),
    providerUpdatedAt: z.iso
      .datetime({ offset: true })
      .nullable()
      .default(null),
    rawPayload: z.json().nullable().default(null),
    summary: z.string().max(20_000).nullable().default(null),
    title: z.string().max(2_000).nullable().default(null),
  })
  .strict();

export const checkpointSchema = z.json();

export const rateLimitStateSchema = z
  .object({
    remaining: z.number().int().nonnegative().optional(),
    resetAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export const connectorPageSchema = z
  .object({
    hasMore: z.boolean(),
    nextCheckpoint: checkpointSchema.nullable(),
    posts: z.array(normalizedSourcePostSchema).max(200),
    rateLimit: rateLimitStateSchema.optional(),
  })
  .strict();

export const connectivityResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      details: z.record(z.string(), z.string().max(500)).default({}),
      message: z.string().max(500),
      ok: z.literal(true),
    })
    .strict(),
  z
    .object({
      code: z.string().regex(/^[A-Z][A-Z0-9_]{2,99}$/u),
      message: z.string().max(500),
      ok: z.literal(false),
      retryAfterSeconds: z.number().int().positive().max(86_400).optional(),
    })
    .strict(),
]);

export type SourceKind = z.infer<typeof sourceKindSchema>;
export type ContentRating = z.infer<typeof contentRatingSchema>;
export type NormalizedMediaAsset = z.infer<typeof normalizedMediaAssetSchema>;
export type NormalizedSourcePost = z.infer<typeof normalizedSourcePostSchema>;
export type ConnectorPage = z.infer<typeof connectorPageSchema>;
export type ConnectivityResult = z.infer<typeof connectivityResultSchema>;
