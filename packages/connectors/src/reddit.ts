import { createHash } from "node:crypto";

import { z } from "zod";

import { ConnectorError, safeConnectorFailure } from "./errors.js";
import {
  connectorPageSchema,
  normalizedMediaAssetSchema,
  normalizedSourcePostSchema,
  type NormalizedMediaAsset,
  type NormalizedSourcePost,
} from "./schemas.js";
import { defineConnector, type ConnectorContext } from "./types.js";

const redditOrigin = "https://oauth.reddit.com";
const redditWebOrigin = "https://www.reddit.com";
const jsonContentTypes = ["application/json"] as const;

const subredditSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^\/?r\//iu, ""))
  .pipe(z.string().regex(/^[A-Za-z0-9_]{3,21}$/u));

export const redditConfigSchema = z
  .object({
    contentPolicy: z
      .enum(["EXCLUDE_ADULT", "TREAT_ADULT_AS_SENSITIVE", "INCLUDE_ADULT"])
      .default("EXCLUDE_ADULT"),
    includeStickied: z.boolean().default(false),
    itemsPerPage: z.number().int().min(1).max(100).default(25),
    minimumScore: z.number().int().min(-1_000_000).max(1_000_000).default(0),
    pageLimit: z.number().int().min(1).max(10).default(3),
    sort: z.enum(["new", "hot", "top", "rising"]).default("new"),
    subreddit: subredditSchema,
    timeWindow: z
      .enum(["hour", "day", "week", "month", "year", "all"])
      .default("day"),
  })
  .strict();

export const redditCheckpointSchema = z
  .object({
    after: z.string().min(1).max(100).nullable(),
    page: z.number().int().min(1).max(10),
    seenExternalIds: z.array(z.string().min(1).max(100)).max(200),
  })
  .strict();

export const redditCredentialSchema = z
  .object({
    clientId: z
      .string()
      .trim()
      .min(3)
      .max(100)
      .regex(/^[A-Za-z0-9_-]+$/u),
    clientSecret: z
      .string()
      .min(8)
      .max(500)
      .refine((value) => !/[\r\n]/u.test(value)),
    userAgent: z
      .string()
      .trim()
      .min(10)
      .max(500)
      .regex(
        /^[^:\r\n]{2,40}:[^:\r\n]{2,120}:v?[A-Za-z0-9._-]{1,40} \(by \/u\/[A-Za-z0-9_-]{3,20}\)$/u,
      ),
  })
  .strict();

const tokenResponseSchema = z.object({
  access_token: z.string().min(1).max(8_192),
  expires_in: z.number().int().min(60).max(86_400),
  scope: z.string().max(1_000),
  token_type: z.string().toLowerCase().pipe(z.literal("bearer")),
});

const redditVideoSchema = z.object({
  duration: z.number().int().nonnegative().max(86_400).optional(),
  fallback_url: z.string().max(2_048),
  height: z.number().int().positive().max(32_768).optional(),
  is_gif: z.boolean().optional(),
  width: z.number().int().positive().max(32_768).optional(),
});

const mediaMetadataSchema = z.object({
  e: z.string().max(30).optional(),
  id: z.string().max(100).optional(),
  m: z.string().max(200).optional(),
  s: z
    .object({
      gif: z.string().max(2_048).optional(),
      mp4: z.string().max(2_048).optional(),
      u: z.string().max(2_048).optional(),
      x: z.number().int().positive().max(32_768).optional(),
      y: z.number().int().positive().max(32_768).optional(),
    })
    .optional(),
  status: z.string().max(30).optional(),
});

const postBaseSchema = z.object({
  author: z.string().max(100).nullable().optional(),
  created_utc: z.number().finite(),
  crosspost_parent: z.string().max(100).optional(),
  gallery_data: z
    .object({
      items: z
        .array(z.object({ media_id: z.string().min(1).max(100) }))
        .max(20),
    })
    .optional(),
  id: z.string().min(1).max(100),
  is_gallery: z.boolean().optional(),
  media_metadata: z.record(z.string().max(100), mediaMetadataSchema).optional(),
  name: z.string().min(1).max(100),
  num_comments: z.number().int().nonnegative().max(2_147_483_647),
  over_18: z.boolean(),
  permalink: z.string().min(1).max(2_048),
  post_hint: z.string().max(100).optional(),
  removed_by_category: z.string().max(100).nullable().optional(),
  score: z.number().int().min(-2_147_483_648).max(2_147_483_647),
  secure_media: z
    .object({ reddit_video: redditVideoSchema.optional() })
    .nullable()
    .optional(),
  spoiler: z.boolean(),
  stickied: z.boolean(),
  subreddit: z.string().min(1).max(100),
  title: z.string().max(2_000),
  url: z.string().max(2_048),
});

type RedditPost = z.infer<typeof postBaseSchema> & {
  crosspost_parent_list?: z.infer<typeof postBaseSchema>[] | undefined;
};

const postDataSchema: z.ZodType<RedditPost> = postBaseSchema.extend({
  crosspost_parent_list: z.array(postBaseSchema).max(1).optional(),
});

const listingSchema = z.object({
  data: z.object({
    after: z.string().max(100).nullable(),
    children: z
      .array(z.object({ data: postDataSchema, kind: z.literal("t3") }))
      .max(100),
  }),
  kind: z.literal("Listing"),
});

const subredditAboutSchema = z.object({
  data: z.object({
    display_name: z.string().min(1).max(100),
    over18: z.boolean().optional(),
    over_18: z.boolean().optional(),
    quarantine: z.boolean().optional(),
    subreddit_type: z.string().max(50),
    title: z.string().max(500),
  }),
  kind: z.literal("t5"),
});

const providerErrorSchema = z.object({
  error: z.number().int().optional(),
  message: z.string().max(200).optional(),
  reason: z.string().max(200).optional(),
});

type RedditConfig = z.infer<typeof redditConfigSchema>;
type RedditCheckpoint = z.infer<typeof redditCheckpointSchema>;

function credential(context: ConnectorContext) {
  const parsed = redditCredentialSchema.safeParse(context.credentials.primary);
  if (!parsed.success) {
    throw new ConnectorError("AUTHENTICATION", {
      code: "SOURCE_REDDIT_CREDENTIAL_MISSING",
    });
  }
  return parsed.data;
}

function retryAfterSeconds(
  headers: Readonly<Record<string, string>>,
  now: Date,
): number | undefined {
  const raw = headers["retry-after"];
  if (!raw) return undefined;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0)
    return Math.min(86_400, Math.ceil(numeric));
  const milliseconds = Date.parse(raw) - now.valueOf();
  return Number.isFinite(milliseconds) && milliseconds > 0
    ? Math.min(86_400, Math.ceil(milliseconds / 1_000))
    : undefined;
}

function throwForStatus(
  response: Awaited<ReturnType<ConnectorContext["http"]["request"]>>,
  now: Date,
  notFoundCode: string,
): void {
  if (response.status < 400) return;
  let reason = "";
  try {
    const body = response.json(providerErrorSchema);
    reason = `${body.message ?? ""} ${body.reason ?? ""}`.toLowerCase();
  } catch {
    /* Provider bodies never become client-visible messages. */
  }
  if (response.status === 401)
    throw new ConnectorError("AUTHENTICATION", {
      code: "SOURCE_REDDIT_AUTH_FAILED",
    });
  if (response.status === 403) {
    const code = reason.includes("quarantin")
      ? "SOURCE_REDDIT_QUARANTINED"
      : reason.includes("private")
        ? "SOURCE_REDDIT_PRIVATE"
        : reason.includes("banned")
          ? "SOURCE_REDDIT_BANNED"
          : "SOURCE_REDDIT_ACCESS_DENIED";
    throw new ConnectorError("CONFIGURATION", { code });
  }
  if (response.status === 404 || response.status === 410)
    throw new ConnectorError("NOT_FOUND", { code: notFoundCode });
  if (response.status === 429) {
    const retryAfter = retryAfterSeconds(response.headers, now);
    throw new ConnectorError("RATE_LIMITED", {
      code: "SOURCE_REDDIT_RATE_LIMITED",
      ...(retryAfter === undefined ? {} : { retryAfterSeconds: retryAfter }),
    });
  }
  if (response.status >= 500)
    throw new ConnectorError("TRANSIENT", {
      code: "SOURCE_REDDIT_UNAVAILABLE",
    });
  throw new ConnectorError("PERMANENT", { code: "SOURCE_REDDIT_REJECTED" });
}

function parseResponse<T>(
  response: Awaited<ReturnType<ConnectorContext["http"]["request"]>>,
  schema: z.ZodType<T>,
  now: Date,
  notFoundCode: string,
): T {
  throwForStatus(response, now, notFoundCode);
  try {
    return response.json(schema);
  } catch (error) {
    throw new ConnectorError("MALFORMED_RESPONSE", {
      cause: error,
      code: "SOURCE_REDDIT_MALFORMED_RESPONSE",
    });
  }
}

async function accessToken(context: ConnectorContext) {
  const credentials = credential(context);
  if (!context.tokenCache)
    throw new ConnectorError("TRANSIENT", {
      code: "SOURCE_TOKEN_CACHE_UNAVAILABLE",
    });
  const key = createHash("sha256")
    .update(`reddit:${credentials.clientId}:${credentials.userAgent}`)
    .digest("hex");
  return context.tokenCache.getOrCreate(key, async () => {
    const response = await context.http.request({
      acceptedStatuses: [400, 401, 403, 429, 500, 502, 503, 504],
      body: new TextEncoder().encode(
        "grant_type=client_credentials&scope=read",
      ),
      expectedContentTypes: jsonContentTypes,
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`, "utf8").toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
      signal: context.abortSignal,
      url: `${redditWebOrigin}/api/v1/access_token`,
      userAgent: credentials.userAgent,
    });
    if (
      new URL(response.url).origin !== redditWebOrigin ||
      new URL(response.url).pathname !== "/api/v1/access_token"
    ) {
      throw new ConnectorError("PERMANENT", {
        code: "SOURCE_REDDIT_OAUTH_REDIRECT_REJECTED",
      });
    }
    if (response.status === 400) {
      throw new ConnectorError("AUTHENTICATION", {
        code: "SOURCE_REDDIT_AUTH_FAILED",
      });
    }
    const value = parseResponse(
      response,
      tokenResponseSchema,
      context.clock.now(),
      "SOURCE_REDDIT_OAUTH_NOT_FOUND",
    );
    return Object.freeze({
      accessToken: value.access_token,
      expiresAt: new Date(
        context.clock.now().valueOf() + value.expires_in * 1_000,
      ).toISOString(),
    });
  });
}

async function apiRequest<T>(
  context: ConnectorContext,
  pathname: string,
  query: Readonly<Record<string, string>>,
  schema: z.ZodType<T>,
  notFoundCode: string,
) {
  const credentials = credential(context);
  const token = await accessToken(context);
  const url = new URL(pathname, redditOrigin);
  for (const [key, value] of Object.entries(query))
    url.searchParams.set(key, value);
  const response = await context.http.request({
    acceptedStatuses: [401, 403, 404, 410, 429, 500, 502, 503, 504],
    expectedContentTypes: jsonContentTypes,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token.accessToken}`,
    },
    signal: context.abortSignal,
    url: url.toString(),
    userAgent: credentials.userAgent,
  });
  const final = new URL(response.url);
  if (final.origin !== redditOrigin || final.pathname !== pathname) {
    throw new ConnectorError("PERMANENT", {
      code: "SOURCE_REDDIT_API_REDIRECT_REJECTED",
    });
  }
  return {
    response,
    value: parseResponse(response, schema, context.clock.now(), notFoundCode),
  } as const;
}

function safeUrl(value: string | undefined, base: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.replaceAll("&amp;", "&"), base);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.toString().length <= 2_048
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function imageKind(
  url: string,
  mimeType: string | undefined,
): "IMAGE" | "ANIMATED_IMAGE" {
  return /(?:\.gif(?:$|\?)|image\/gif)/iu.test(`${url} ${mimeType ?? ""}`)
    ? "ANIMATED_IMAGE"
    : "IMAGE";
}

function galleryMedia(post: RedditPost): NormalizedMediaAsset[] {
  const result: NormalizedMediaAsset[] = [];
  for (const item of post.gallery_data?.items ?? []) {
    const metadata = post.media_metadata?.[item.media_id];
    const remoteUrl = safeUrl(
      metadata?.s?.gif ?? metadata?.s?.mp4 ?? metadata?.s?.u,
      redditWebOrigin,
    );
    if (!metadata || metadata.status !== "valid" || !remoteUrl) continue;
    const video = Boolean(metadata.s?.mp4);
    result.push(
      normalizedMediaAssetSchema.parse({
        height: metadata.s?.y ?? null,
        kind: video ? "VIDEO" : imageKind(remoteUrl, metadata.m),
        mimeType: metadata.m ?? (video ? "video/mp4" : null),
        remoteUrl,
        width: metadata.s?.x ?? null,
      }),
    );
  }
  return result;
}

function mediaFor(post: RedditPost): NormalizedMediaAsset[] {
  if (post.is_gallery) return galleryMedia(post);
  const video = post.secure_media?.reddit_video;
  const videoUrl = safeUrl(video?.fallback_url, redditWebOrigin);
  if (video && videoUrl)
    return [
      normalizedMediaAssetSchema.parse({
        durationMilliseconds:
          video.duration === undefined ? null : video.duration * 1_000,
        height: video.height ?? null,
        kind: "VIDEO",
        mimeType: "video/mp4",
        remoteUrl: videoUrl,
        width: video.width ?? null,
      }),
    ];
  const direct = safeUrl(post.url, redditWebOrigin);
  if (direct && /\.(?:avif|gif|jpe?g|png|webp)(?:$|\?)/iu.test(direct))
    return [
      normalizedMediaAssetSchema.parse({
        kind: imageKind(direct, undefined),
        remoteUrl: direct,
      }),
    ];
  return direct
    ? [normalizedMediaAssetSchema.parse({ kind: "LINK", remoteUrl: direct })]
    : [];
}

function normalizePost(
  post: RedditPost,
  config: RedditConfig,
  now: Date,
): NormalizedSourcePost | null {
  if (
    (!config.includeStickied && post.stickied) ||
    post.score < config.minimumScore
  )
    return null;
  if (post.over_18 && config.contentPolicy === "EXCLUDE_ADULT") return null;
  const removed =
    Boolean(post.removed_by_category) ||
    post.author === "[deleted]" ||
    ["[deleted]", "[removed]"].includes(post.title.toLowerCase());
  const originalUrl = new URL(post.permalink, redditWebOrigin).toString();
  const effective = post.crosspost_parent_list?.[0] ?? post;
  const rating = post.over_18
    ? config.contentPolicy === "INCLUDE_ADULT"
      ? "ADULT"
      : "SENSITIVE"
    : post.spoiler
      ? "SENSITIVE"
      : "SAFE";
  return normalizedSourcePostSchema.parse({
    authorName: removed ? null : (post.author ?? null),
    categories: [
      "reddit",
      `r/${post.subreddit}`,
      ...(post.crosspost_parent ? ["crosspost"] : []),
    ],
    communityName: `r/${post.subreddit}`,
    contentRating: rating,
    contentWarning: removed
      ? "Removed or deleted at Reddit."
      : post.over_18
        ? "Marked adult by Reddit."
        : post.spoiler
          ? "Marked as a spoiler by Reddit."
          : null,
    externalId: post.name,
    media: removed ? [] : mediaFor(effective),
    originalUrl,
    providerCommentCount: post.num_comments,
    providerCreatedAt: new Date(
      Math.max(0, post.created_utc) * 1_000,
    ).toISOString(),
    providerDeletedAt: removed ? now.toISOString() : null,
    providerScore: post.score,
    rawPayload: null,
    summary: null,
    title: removed ? "Removed Reddit post" : post.title,
  });
}

function rateLimit(headers: Readonly<Record<string, string>>, now: Date) {
  const remaining = Number(headers["x-ratelimit-remaining"]);
  const resetSeconds = Number(headers["x-ratelimit-reset"]);
  const result = {
    ...(Number.isFinite(remaining) && remaining >= 0
      ? { remaining: Math.floor(remaining) }
      : {}),
    ...(Number.isFinite(resetSeconds) && resetSeconds > 0
      ? {
          resetAt: new Date(
            now.valueOf() + Math.ceil(resetSeconds) * 1_000,
          ).toISOString(),
        }
      : {}),
  };
  return Object.keys(result).length > 0 ? result : undefined;
}

function emptyCheckpoint(): RedditCheckpoint {
  return { after: null, page: 1, seenExternalIds: [] };
}

async function requestAbout(context: ConnectorContext, config: RedditConfig) {
  return apiRequest(
    context,
    `/r/${encodeURIComponent(config.subreddit)}/about`,
    { raw_json: "1" },
    subredditAboutSchema,
    "SOURCE_REDDIT_SUBREDDIT_NOT_FOUND",
  );
}

async function requestListing(
  context: ConnectorContext,
  config: RedditConfig,
  checkpoint: RedditCheckpoint,
) {
  return apiRequest(
    context,
    `/r/${encodeURIComponent(config.subreddit)}/${config.sort}`,
    {
      ...(checkpoint.after ? { after: checkpoint.after } : {}),
      limit: String(config.itemsPerPage),
      raw_json: "1",
      ...(config.sort === "top" ? { t: config.timeWindow } : {}),
    },
    listingSchema,
    "SOURCE_REDDIT_SUBREDDIT_NOT_FOUND",
  );
}

export const redditConnector = defineConnector({
  kind: "REDDIT",
  validateCheckpoint: (input) => redditCheckpointSchema.parse(input),
  validateConfig: (input) => redditConfigSchema.parse(input),
  validateConnectivity: async (context, config) => {
    try {
      const about = await requestAbout(context, config);
      if (about.value.data.quarantine)
        throw new ConnectorError("CONFIGURATION", {
          code: "SOURCE_REDDIT_QUARANTINED",
        });
      if (
        ["private", "gold_restricted", "archived"].includes(
          about.value.data.subreddit_type,
        )
      ) {
        throw new ConnectorError("CONFIGURATION", {
          code: "SOURCE_REDDIT_PRIVATE",
        });
      }
      const listing = await requestListing(context, config, emptyCheckpoint());
      return {
        details: {
          apiCompatibility: "Reddit Data API (OAuth2, read scope)",
          credentialHealth: "valid",
          sampleItemCount: String(listing.value.data.children.length),
          subreddit: `r/${about.value.data.display_name}`,
          subredditTitle: about.value.data.title,
        },
        message: `Connected to r/${about.value.data.display_name}.`,
        ok: true,
      } as const;
    } catch (error) {
      context.logger.warn("reddit connectivity validation failed", {
        errorCode:
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : undefined,
        errorType: error instanceof Error ? error.name : typeof error,
      });
      const safe = safeConnectorFailure(error);
      return {
        code: safe.code,
        message: safe.message,
        ok: false as const,
        ...(safe.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: safe.retryAfterSeconds }),
      };
    }
  },
  fetchPage: async (context, config, checkpoint) => {
    const current = checkpoint ?? emptyCheckpoint();
    const result = await requestListing(context, config, current);
    const seen = new Set(current.seenExternalIds);
    const posts: NormalizedSourcePost[] = [];
    for (const child of result.value.data.children) {
      if (seen.has(child.data.name)) continue;
      seen.add(child.data.name);
      const normalized = normalizePost(child.data, config, context.clock.now());
      if (normalized) posts.push(normalized);
    }
    const pageLimit = Math.min(config.pageLimit, context.limits.maxPages);
    const hasMore =
      Boolean(result.value.data.after) && current.page < pageLimit;
    return connectorPageSchema.parse({
      hasMore,
      nextCheckpoint: hasMore
        ? {
            after: result.value.data.after,
            page: current.page + 1,
            seenExternalIds: [...seen].slice(-200),
          }
        : emptyCheckpoint(),
      posts,
      rateLimit: rateLimit(result.response.headers, context.clock.now()),
    });
  },
});
