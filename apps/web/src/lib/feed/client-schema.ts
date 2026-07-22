import { z } from "zod";

import { actionStateSchema } from "../actions/client";

const httpUrlSchema = z
  .url()
  .max(2_048)
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  });

const cachedMediaUrlSchema = z.string().regex(/^\/api\/media\/[0-9a-f-]{36}$/i);

export const feedModeSchema = z.enum(["new", "hot", "random", "unseen"]);
export const mediaKindSchema = z.enum([
  "IMAGE",
  "ANIMATED_IMAGE",
  "VIDEO",
  "LINK",
]);

export const feedMediaSchema = z
  .object({
    altText: z.string().nullable(),
    byteLength: z.string().nullable(),
    cacheState: z.enum([
      "REMOTE_ONLY",
      "QUEUED",
      "FETCHING",
      "CACHED",
      "EVICTED",
      "FAILED",
      "BLOCKED",
    ]),
    durationMs: z.number().int().nonnegative().nullable(),
    height: z.number().int().positive().nullable(),
    id: z.uuid(),
    kind: mediaKindSchema,
    mimeType: z.string().nullable(),
    remoteUrl: httpUrlSchema,
    renderUrl: z.union([httpUrlSchema, cachedMediaUrlSchema]),
    width: z.number().int().positive().nullable(),
  })
  .passthrough();

export const feedItemSchema = z.object({
  actionState: actionStateSchema,
  alternateSourceCount: z.number().int().nonnegative(),
  authorName: z.string().nullable(),
  contentRating: z.enum(["SAFE", "SENSITIVE", "ADULT", "UNKNOWN"]),
  contentWarning: z.string().nullable(),
  duplicateGroup: z
    .object({
      id: z.uuid(),
      itemCount: z.number().int().min(2).max(50),
    })
    .nullable()
    .default(null),
  id: z.uuid(),
  media: feedMediaSchema.nullable(),
  primarySource: z
    .object({
      displayName: z.string(),
      kind: z.enum(["RSS", "LEMMY", "MASTODON", "REDDIT"]),
      providerUrl: httpUrlSchema.nullable(),
      sourceId: z.uuid(),
    })
    .nullable(),
  publishedAt: z.iso.datetime({ offset: true }),
  ranking: z
    .object({
      decayHours: z.number().positive(),
      formula: z.string(),
      score: z.number(),
    })
    .optional(),
  summary: z.string().nullable(),
  title: z.string().nullable(),
});

export const feedPageSchema = z.object({
  hasMore: z.boolean(),
  items: z.array(feedItemSchema).max(50),
  nextCursor: z.string().max(2_048).nullable(),
  seed: z.string().max(128).optional(),
});

export type FeedItem = z.infer<typeof feedItemSchema>;
export type FeedMedia = z.infer<typeof feedMediaSchema>;
export type FeedMode = z.infer<typeof feedModeSchema>;
export type FeedPage = z.infer<typeof feedPageSchema>;
