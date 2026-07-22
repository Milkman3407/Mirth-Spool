import { z } from "zod";

import { ConnectorError, safeConnectorFailure } from "./errors.js";
import {
  connectorPageSchema,
  normalizedMediaAssetSchema,
  normalizedSourcePostSchema,
  type ContentRating,
  type NormalizedMediaAsset,
  type NormalizedSourcePost,
} from "./schemas.js";
import { defineConnector, type ConnectorContext } from "./types.js";

const instanceUrlSchema = z
  .url()
  .max(2_048)
  .transform((value, context) => {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) {
      context.addIssue({
        code: "custom",
        message: "Instance URL must be an HTTP(S) origin without credentials",
      });
      return z.NEVER;
    }
    return url.origin;
  });

const communitySchema = z
  .union([
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    z
      .string()
      .trim()
      .regex(/^(?:[A-Za-z0-9_]{1,100}|[1-9]\d{0,15})$/u),
  ])
  .transform(String);

export const lemmyConfigSchema = z
  .object({
    community: communitySchema,
    contentPolicy: z
      .enum(["EXCLUDE_ADULT", "INCLUDE_ADULT", "TREAT_ADULT_AS_SENSITIVE"])
      .default("EXCLUDE_ADULT"),
    instanceUrl: instanceUrlSchema,
    itemsPerPage: z.number().int().min(1).max(50).default(20),
    minimumScore: z.number().int().min(-1_000_000).max(1_000_000).default(0),
    pageLimit: z.number().int().min(1).max(10).default(3),
    sort: z
      .enum([
        "Active",
        "Hot",
        "New",
        "TopDay",
        "TopWeek",
        "TopMonth",
        "TopYear",
        "TopAll",
      ])
      .default("New"),
  })
  .strict();

export const lemmyCheckpointSchema = z
  .object({
    page: z.number().int().min(1).max(10),
    seenExternalIds: z.array(z.string().min(1).max(1_024)).max(100),
  })
  .strict();

type LemmyConfig = z.infer<typeof lemmyConfigSchema>;
type LemmyCheckpoint = z.infer<typeof lemmyCheckpointSchema>;

const providerIdSchema = z.union([
  z.number().int().nonnegative(),
  z.string().trim().min(1).max(1_024),
]);

const communitySchemaV3 = z.object({
  actor_id: z.string().max(2_048).optional(),
  deleted: z.boolean().optional(),
  id: providerIdSchema,
  name: z.string().trim().min(1).max(500),
  nsfw: z.boolean().optional(),
  removed: z.boolean().optional(),
  title: z.string().trim().min(1).max(500),
});

const communityResponseSchema = z.object({
  community_view: z.object({ community: communitySchemaV3 }),
});

const postViewSchema = z.object({
  community: communitySchemaV3,
  counts: z.object({
    comments: z.number().int().nonnegative().optional(),
    score: z.number().int().optional(),
  }),
  creator: z.object({
    actor_id: z.string().max(2_048).optional(),
    name: z.string().trim().min(1).max(500),
  }),
  image_details: z
    .object({
      content_type: z.string().trim().max(200).optional(),
      height: z.number().int().positive().max(32_768).optional(),
      link: z.string().max(2_048).optional(),
      width: z.number().int().positive().max(32_768).optional(),
    })
    .nullish(),
  post: z.object({
    ap_id: z.string().max(2_048).optional(),
    body: z.string().max(100_000).optional(),
    deleted: z.boolean().optional(),
    embed_description: z.string().max(20_000).optional(),
    embed_title: z.string().max(2_000).optional(),
    id: providerIdSchema,
    name: z.string().max(2_000),
    nsfw: z.boolean().optional(),
    published: z.string().max(100),
    removed: z.boolean().optional(),
    thumbnail_url: z.string().max(2_048).optional(),
    updated: z.string().max(100).optional(),
    url: z.string().max(2_048).optional(),
  }),
});

const postsResponseSchema = z.object({
  posts: z.array(postViewSchema).max(200),
});

const providerErrorSchema = z.object({
  error: z.string().trim().min(1).max(200),
});

const jsonContentTypes = ["application/json"] as const;

function apiUrl(config: LemmyConfig, path: string): URL {
  return new URL(`/api/v3/${path}`, `${config.instanceUrl}/`);
}

function communityQuery(url: URL, community: string): void {
  url.searchParams.set(/^\d+$/u.test(community) ? "id" : "name", community);
}

function safeUrl(value: string | undefined, base: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.toString().length > 2_048
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function cleanText(value: string | undefined, maximum: number): string | null {
  if (!value) return null;
  const cleaned = value
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return (
        code === 9 || code === 10 || code === 13 || (code > 31 && code !== 127)
      );
    })
    .join("")
    .replace(/\s+/gu, " ")
    .trim();
  return cleaned ? cleaned.slice(0, maximum) : null;
}

function parseDate(value: string | undefined, fallback: Date): string {
  const milliseconds = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : fallback.toISOString();
}

function providerError(code: string): ConnectorError {
  if (/couldnt_find_community|community_not_found/iu.test(code)) {
    return new ConnectorError("NOT_FOUND", {
      code: "SOURCE_COMMUNITY_NOT_FOUND",
    });
  }
  if (/private|banned|not_logged_in|not_authorized/iu.test(code)) {
    return new ConnectorError("AUTHENTICATION", {
      code: "SOURCE_COMMUNITY_RESTRICTED",
    });
  }
  if (/invalid.*community|community.*invalid/iu.test(code)) {
    return new ConnectorError("CONFIGURATION", {
      code: "SOURCE_COMMUNITY_INVALID",
    });
  }
  return new ConnectorError("PERMANENT", {
    code: "SOURCE_UPSTREAM_REJECTED",
  });
}

function parseProviderResponse<T>(
  response: Awaited<ReturnType<ConnectorContext["http"]["request"]>>,
  schema: z.ZodType<T>,
): T {
  if (response.status === 400) {
    try {
      throw providerError(response.json(providerErrorSchema).error);
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      throw new ConnectorError("MALFORMED_RESPONSE", {
        cause: error,
        code: "MALFORMED_PROVIDER_RESPONSE",
      });
    }
  }
  try {
    return response.json(schema);
  } catch (error) {
    throw new ConnectorError("MALFORMED_RESPONSE", {
      cause: error,
      code: "MALFORMED_PROVIDER_RESPONSE",
    });
  }
}

async function requestCommunity(
  context: ConnectorContext,
  config: LemmyConfig,
) {
  const url = apiUrl(config, "community");
  communityQuery(url, config.community);
  const response = await context.http.request({
    acceptedStatuses: [400],
    expectedContentTypes: jsonContentTypes,
    headers: { accept: "application/json" },
    signal: context.abortSignal,
    url: url.toString(),
  });
  return parseProviderResponse(response, communityResponseSchema).community_view
    .community;
}

async function requestPosts(
  context: ConnectorContext,
  config: LemmyConfig,
  page: number,
) {
  const url = apiUrl(config, "post/list");
  url.searchParams.set(
    /^\d+$/u.test(config.community) ? "community_id" : "community_name",
    config.community,
  );
  url.searchParams.set("limit", String(config.itemsPerPage));
  url.searchParams.set("page", String(page));
  url.searchParams.set("show_nsfw", "true");
  url.searchParams.set("sort", config.sort);
  url.searchParams.set("type_", "Local");
  const response = await context.http.request({
    acceptedStatuses: [400],
    expectedContentTypes: jsonContentTypes,
    headers: { accept: "application/json" },
    signal: context.abortSignal,
    url: url.toString(),
  });
  return {
    response,
    value: parseProviderResponse(response, postsResponseSchema),
  } as const;
}

function ratingFor(
  postNsfw: boolean | undefined,
  communityNsfw: boolean | undefined,
  policy: LemmyConfig["contentPolicy"],
): ContentRating | null {
  const nsfw = postNsfw === true || communityNsfw === true;
  if (nsfw && policy === "EXCLUDE_ADULT") return null;
  if (nsfw && policy === "TREAT_ADULT_AS_SENSITIVE") return "SENSITIVE";
  if (nsfw) return "ADULT";
  return postNsfw === false && communityNsfw === false ? "SAFE" : "UNKNOWN";
}

function mediaKind(
  url: string,
  mimeType: string | undefined,
): NormalizedMediaAsset["kind"] {
  const type = mimeType?.toLowerCase();
  if (type?.startsWith("video/") || /\.(?:mp4|webm|mov)(?:$|\?)/iu.test(url)) {
    return "VIDEO";
  }
  if (type === "image/gif" || /\.gif(?:$|\?)/iu.test(url)) {
    return "ANIMATED_IMAGE";
  }
  if (
    type?.startsWith("image/") ||
    /\.(?:avif|jpe?g|png|webp)(?:$|\?)/iu.test(url)
  ) {
    return "IMAGE";
  }
  return "LINK";
}

function mediaFor(
  view: z.infer<typeof postViewSchema>,
  originalUrl: string,
  instanceUrl: string,
): NormalizedMediaAsset[] {
  const target = safeUrl(view.post.url, instanceUrl);
  const thumbnail = safeUrl(view.post.thumbnail_url, instanceUrl);
  const detailsLink = safeUrl(view.image_details?.link, instanceUrl);
  const remoteUrl = detailsLink ?? target ?? thumbnail;
  if (!remoteUrl) {
    return [
      normalizedMediaAssetSchema.parse({
        kind: "LINK",
        remoteUrl: originalUrl,
      }),
    ];
  }
  const kind = mediaKind(remoteUrl, view.image_details?.content_type);
  if (kind === "LINK") {
    return [
      normalizedMediaAssetSchema.parse({
        kind,
        previewUrl: thumbnail,
        remoteUrl,
      }),
    ];
  }
  return [
    normalizedMediaAssetSchema.parse({
      height: view.image_details?.height,
      kind,
      mimeType: view.image_details?.content_type,
      previewUrl: thumbnail && thumbnail !== remoteUrl ? thumbnail : null,
      remoteUrl,
      width: view.image_details?.width,
    }),
  ];
}

function warningFor(
  body: string | undefined,
  nsfw: boolean,
  removed: boolean,
): string | null {
  if (removed) return "Removed by the Lemmy provider.";
  const explicit = body?.match(
    /(?:^|\n)\s*(?:cw|content warning|warning)\s*:\s*([^\n]{1,1900})/iu,
  )?.[1];
  return cleanText(explicit, 2_000) ?? (nsfw ? "Marked NSFW by Lemmy." : null);
}

function normalizePost(
  view: z.infer<typeof postViewSchema>,
  config: LemmyConfig,
  now: Date,
): NormalizedSourcePost | null {
  const score = view.counts.score ?? 0;
  if (score < config.minimumScore) return null;
  const rating = ratingFor(
    view.post.nsfw,
    view.community.nsfw,
    config.contentPolicy,
  );
  if (rating === null) return null;
  const removed = view.post.deleted === true || view.post.removed === true;
  const instance = new URL(config.instanceUrl);
  const externalId = String(view.post.id);
  const fallback = new URL(`/post/${encodeURIComponent(externalId)}`, instance);
  const originalUrl =
    safeUrl(view.post.ap_id, config.instanceUrl) ?? fallback.toString();
  const published = parseDate(view.post.published, now);
  const summary = cleanText(
    view.post.body ?? view.post.embed_description,
    20_000,
  );
  return normalizedSourcePostSchema.parse({
    authorName: cleanText(view.creator.name, 500),
    categories: ["lemmy", view.community.name],
    communityName: `${view.community.name}@${instance.hostname.toLowerCase()}`,
    contentRating: rating,
    contentWarning: warningFor(
      view.post.body,
      view.post.nsfw === true || view.community.nsfw === true,
      removed,
    ),
    externalId,
    media: removed ? [] : mediaFor(view, originalUrl, config.instanceUrl),
    originalUrl,
    providerCommentCount: view.counts.comments ?? null,
    providerCreatedAt: published,
    providerDeletedAt: removed ? now.toISOString() : null,
    providerScore: view.counts.score ?? null,
    providerUpdatedAt: view.post.updated
      ? parseDate(view.post.updated, now)
      : null,
    rawPayload: null,
    summary: removed ? null : summary,
    title: cleanText(
      removed ? "Removed Lemmy post" : view.post.name || view.post.embed_title,
      2_000,
    ),
  });
}

function rateLimit(
  headers: Readonly<Record<string, string>>,
): { remaining?: number; resetAt?: string } | undefined {
  const remaining = Number(headers["x-ratelimit-remaining"]);
  const resetValue = headers["x-ratelimit-reset"];
  const resetMilliseconds = resetValue ? Date.parse(resetValue) : Number.NaN;
  const result = {
    ...(Number.isInteger(remaining) && remaining >= 0 ? { remaining } : {}),
    ...(Number.isFinite(resetMilliseconds)
      ? { resetAt: new Date(resetMilliseconds).toISOString() }
      : {}),
  };
  return Object.keys(result).length > 0 ? result : undefined;
}

export const lemmyConnector = defineConnector({
  kind: "LEMMY",
  validateCheckpoint: (input) => lemmyCheckpointSchema.parse(input),
  validateConfig: (input) => lemmyConfigSchema.parse(input),
  validateConnectivity: async (context, config) => {
    try {
      const community = await requestCommunity(context, config);
      if (community.deleted || community.removed) {
        throw new ConnectorError("NOT_FOUND", {
          code: "SOURCE_COMMUNITY_NOT_FOUND",
        });
      }
      const instanceHost = new URL(config.instanceUrl).hostname.toLowerCase();
      return {
        details: {
          apiCompatibility: "Lemmy 0.19 / API v3",
          communityId: String(community.id),
          communityName: community.name,
          communityTitle: community.title,
          instanceHost,
        },
        message: `Connected to ${community.name}@${instanceHost}.`,
        ok: true,
      } as const;
    } catch (error) {
      context.logger.warn("lemmy connectivity validation failed", {
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
    const current: LemmyCheckpoint = checkpoint ?? {
      page: 1,
      seenExternalIds: [],
    };
    const { response, value } = await requestPosts(
      context,
      config,
      current.page,
    );
    const seen = new Set(current.seenExternalIds);
    const posts: NormalizedSourcePost[] = [];
    for (const view of value.posts) {
      const id = String(view.post.id);
      if (seen.has(id)) continue;
      seen.add(id);
      const post = normalizePost(view, config, context.clock.now());
      if (post) posts.push(post);
    }
    const pageLimit = Math.min(config.pageLimit, context.limits.maxPages);
    const hasMore =
      value.posts.length === config.itemsPerPage && current.page < pageLimit;
    const nextCheckpoint = hasMore
      ? {
          page: current.page + 1,
          seenExternalIds: [...seen].slice(-100),
        }
      : { page: 1, seenExternalIds: [] };
    return connectorPageSchema.parse({
      hasMore,
      nextCheckpoint,
      posts,
      rateLimit: rateLimit(response.headers),
    });
  },
});
