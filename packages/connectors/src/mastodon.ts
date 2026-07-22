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

const hashtagSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^#/u, ""))
  .pipe(z.string().regex(/^[\p{L}\p{N}_]{1,100}$/u));

const accountSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/^@/u, ""))
  .pipe(
    z
      .string()
      .min(1)
      .max(255)
      .regex(/^[A-Za-z0-9_]+(?:@[A-Za-z0-9.-]+)?$/u),
  );

export const mastodonConfigSchema = z
  .object({
    identifier: z.string(),
    includeReblogs: z.boolean().default(false),
    instanceUrl: instanceUrlSchema,
    itemsPerPage: z.number().int().min(1).max(40).default(20),
    language: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/u)
      .nullable()
      .default(null),
    minimumMedia: z.number().int().min(1).max(4).default(1),
    mode: z.enum(["HASHTAG", "ACCOUNT"]),
    pageLimit: z.number().int().min(1).max(10).default(3),
  })
  .strict()
  .transform((value, context) => {
    const parsed =
      value.mode === "HASHTAG"
        ? hashtagSchema.safeParse(value.identifier)
        : accountSchema.safeParse(value.identifier);
    if (!parsed.success) {
      context.addIssue({
        code: "custom",
        message:
          value.mode === "HASHTAG"
            ? "Hashtag syntax is invalid"
            : "Account handle syntax is invalid",
        path: ["identifier"],
      });
      return z.NEVER;
    }
    return { ...value, identifier: parsed.data };
  });

export const mastodonCheckpointSchema = z
  .object({
    accountId: z.string().min(1).max(1_024).nullable().default(null),
    newestId: z.string().min(1).max(1_024).nullable().default(null),
    nextUrl: z.string().max(2_048).nullable().default(null),
    page: z.number().int().min(1).max(10),
    seenExternalIds: z.array(z.string().min(1).max(1_024)).max(100),
    sinceId: z.string().min(1).max(1_024).nullable().default(null),
  })
  .strict();

type MastodonConfig = z.infer<typeof mastodonConfigSchema>;
type MastodonCheckpoint = z.infer<typeof mastodonCheckpointSchema>;

const providerIdSchema = z.string().trim().min(1).max(1_024);
const countSchema = z.number().int().nonnegative().max(2_147_483_647);

const accountEntitySchema = z.object({
  acct: z.string().max(255),
  display_name: z.string().max(2_000),
  id: providerIdSchema,
  locked: z.boolean().optional(),
  url: z.string().max(2_048),
  username: z.string().max(255),
});

const mediaMetaSchema = z
  .object({
    aspect: z.number().finite().positive().max(100).optional(),
    duration: z.number().finite().nonnegative().max(86_400).optional(),
    height: z.number().int().positive().max(32_768).optional(),
    size: z.string().max(50).optional(),
    width: z.number().int().positive().max(32_768).optional(),
  })
  .optional();

const mediaAttachmentSchema = z.object({
  description: z.string().max(20_000).nullable().optional(),
  id: providerIdSchema,
  meta: z
    .object({ original: mediaMetaSchema, small: mediaMetaSchema })
    .nullish(),
  preview_url: z.string().max(2_048).nullable().optional(),
  remote_url: z.string().max(2_048).nullable().optional(),
  type: z.string().trim().min(1).max(50),
  url: z.string().max(2_048).nullable().optional(),
});

const statusBaseSchema = z.object({
  account: accountEntitySchema,
  content: z.string().max(100_000),
  created_at: z.string().max(100),
  deleted_at: z.string().max(100).nullable().optional(),
  edited_at: z.string().max(100).nullable().optional(),
  favourites_count: countSchema,
  id: providerIdSchema,
  language: z.string().max(35).nullable().optional(),
  media_attachments: z.array(mediaAttachmentSchema).max(20),
  reblogs_count: countSchema,
  replies_count: countSchema,
  sensitive: z.boolean(),
  spoiler_text: z.string().max(20_000),
  uri: z.string().max(2_048),
  url: z.string().max(2_048).nullable().optional(),
  visibility: z.string().max(30),
});

type MastodonStatus = z.infer<typeof statusBaseSchema> & {
  readonly reblog: MastodonStatus | null;
};

const statusSchema: z.ZodType<MastodonStatus> = statusBaseSchema.extend({
  reblog: z.lazy(() => statusSchema).nullable(),
});

const timelineSchema = z.array(statusSchema).max(200);
const tagEntitySchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: z.string().max(2_048),
});
const instanceEntitySchema = z.object({
  api_versions: z
    .object({ mastodon: z.number().int().nonnegative().optional() })
    .optional(),
  domain: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(500),
  version: z.string().trim().min(1).max(200),
});
const providerErrorSchema = z.object({
  error: z.string().trim().min(1).max(500),
});
const jsonContentTypes = ["application/json"] as const;

function apiUrl(config: MastodonConfig, pathname: string): URL {
  return new URL(pathname, `${config.instanceUrl}/`);
}

function safeUrl(
  value: string | null | undefined,
  base: string,
): string | null {
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

function decodeEntities(value: string): string {
  return value.replace(
    /&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]{2,10}));/giu,
    (
      entity,
      decimal: string | undefined,
      hexadecimal: string | undefined,
      name: string | undefined,
    ) => {
      if (decimal || hexadecimal) {
        const codePoint = Number.parseInt(
          decimal ?? hexadecimal ?? "",
          decimal ? 10 : 16,
        );
        return Number.isSafeInteger(codePoint) &&
          codePoint >= 0 &&
          codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : " ";
      }
      const named: Readonly<Record<string, string>> = {
        amp: "&",
        apos: "'",
        gt: ">",
        lt: "<",
        nbsp: " ",
        quot: '"',
      };
      return named[name?.toLowerCase() ?? ""] ?? " ";
    },
  );
}

export function mastodonHtmlToPlainText(
  value: string | null | undefined,
  maximum: number,
): string | null {
  if (!value) return null;
  const withoutActiveBlocks = value.replace(
    /<(?:script|style|svg|math)\b[^>]*>[\s\S]*?<\/(?:script|style|svg|math)\s*>/giu,
    " ",
  );
  const withoutTags = withoutActiveBlocks
    .replace(/<(?:br|p|div|li|blockquote|h[1-6])\b[^>]*>/giu, " ")
    .replace(/<[^>]*>?/gu, " ");
  const cleaned = decodeEntities(withoutTags)
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

function parseDate(value: string | null | undefined, fallback: Date): string {
  const milliseconds = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : fallback.toISOString();
}

function retryAfterSeconds(
  headers: Readonly<Record<string, string>>,
  now: Date,
): number | undefined {
  const raw = headers["retry-after"];
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isInteger(seconds) && seconds > 0)
    return Math.min(seconds, 86_400);
  const milliseconds = Date.parse(raw) - now.valueOf();
  return Number.isFinite(milliseconds) && milliseconds > 0
    ? Math.min(Math.ceil(milliseconds / 1_000), 86_400)
    : undefined;
}

function throwForStatus(
  response: Awaited<ReturnType<ConnectorContext["http"]["request"]>>,
  missingCode: string,
  now: Date,
): void {
  if (response.status < 400) return;
  try {
    response.json(providerErrorSchema);
  } catch {
    // Provider bodies are deliberately ignored and never surfaced.
  }
  if (response.status === 401 || response.status === 403) {
    throw new ConnectorError("AUTHENTICATION", {
      code: "SOURCE_PUBLIC_TIMELINE_RESTRICTED",
    });
  }
  if (response.status === 404 || response.status === 410) {
    throw new ConnectorError("NOT_FOUND", { code: missingCode });
  }
  if (response.status === 422) {
    throw new ConnectorError("CONFIGURATION", {
      code: "SOURCE_IDENTIFIER_INVALID",
    });
  }
  if (response.status === 429) {
    const retryAfter = retryAfterSeconds(response.headers, now);
    throw new ConnectorError("RATE_LIMITED", {
      code: "SOURCE_RATE_LIMITED",
      ...(retryAfter === undefined ? {} : { retryAfterSeconds: retryAfter }),
    });
  }
  throw new ConnectorError("PERMANENT", { code: "SOURCE_UPSTREAM_REJECTED" });
}

function parseProviderResponse<T>(
  response: Awaited<ReturnType<ConnectorContext["http"]["request"]>>,
  schema: z.ZodType<T>,
  missingCode: string,
  now: Date,
): T {
  throwForStatus(response, missingCode, now);
  try {
    return response.json(schema);
  } catch (error) {
    throw new ConnectorError("MALFORMED_RESPONSE", {
      cause: error,
      code: "MALFORMED_PROVIDER_RESPONSE",
    });
  }
}

function assertApiResponseOrigin(
  responseUrl: string,
  config: MastodonConfig,
  pathname: string,
): void {
  const response = new URL(responseUrl);
  if (
    response.origin !== config.instanceUrl ||
    response.pathname !== pathname
  ) {
    throw new ConnectorError("PERMANENT", {
      code: "SOURCE_PAGINATION_ORIGIN_REJECTED",
    });
  }
}

async function requestJson<T>(
  context: ConnectorContext,
  config: MastodonConfig,
  url: URL,
  schema: z.ZodType<T>,
  missingCode: string,
): Promise<{
  readonly response: Awaited<ReturnType<ConnectorContext["http"]["request"]>>;
  readonly value: T;
}> {
  const response = await context.http.request({
    acceptedStatuses: [401, 403, 404, 410, 422, 429],
    expectedContentTypes: jsonContentTypes,
    headers: { accept: "application/json" },
    signal: context.abortSignal,
    url: url.toString(),
  });
  assertApiResponseOrigin(response.url, config, url.pathname);
  return {
    response,
    value: parseProviderResponse(
      response,
      schema,
      missingCode,
      context.clock.now(),
    ),
  };
}

async function requestInstance(
  context: ConnectorContext,
  config: MastodonConfig,
) {
  return (
    await requestJson(
      context,
      config,
      apiUrl(config, "/api/v2/instance"),
      instanceEntitySchema,
      "SOURCE_INSTANCE_NOT_FOUND",
    )
  ).value;
}

async function requestAccount(
  context: ConnectorContext,
  config: MastodonConfig,
) {
  const url = apiUrl(config, "/api/v1/accounts/lookup");
  url.searchParams.set("acct", config.identifier);
  return (
    await requestJson(
      context,
      config,
      url,
      accountEntitySchema,
      "SOURCE_ACCOUNT_NOT_FOUND",
    )
  ).value;
}

async function requestTag(context: ConnectorContext, config: MastodonConfig) {
  const pathname = `/api/v1/tags/${encodeURIComponent(config.identifier)}`;
  return (
    await requestJson(
      context,
      config,
      apiUrl(config, pathname),
      tagEntitySchema,
      "SOURCE_HASHTAG_NOT_FOUND",
    )
  ).value;
}

function timelinePath(
  config: MastodonConfig,
  accountId: string | null,
): string {
  return config.mode === "HASHTAG"
    ? `/api/v1/timelines/tag/${encodeURIComponent(config.identifier)}`
    : `/api/v1/accounts/${encodeURIComponent(accountId ?? "")}/statuses`;
}

function validateNextUrl(
  raw: string,
  config: MastodonConfig,
  expectedPath: string,
): string {
  const url = new URL(raw, `${config.instanceUrl}/`);
  const allowedKeys = new Set([
    "exclude_replies",
    "limit",
    "max_id",
    "min_id",
    "only_media",
    "since_id",
  ]);
  if (
    url.origin !== config.instanceUrl ||
    url.pathname !== expectedPath ||
    url.username ||
    url.password ||
    url.hash ||
    url.toString().length > 2_048 ||
    [...url.searchParams.keys()].some((key) => !allowedKeys.has(key))
  ) {
    throw new ConnectorError("PERMANENT", {
      code: "SOURCE_PAGINATION_ORIGIN_REJECTED",
    });
  }
  return url.toString();
}

function nextLink(
  header: string | undefined,
  config: MastodonConfig,
  expectedPath: string,
): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel=(?:"next"|next)(?:\s*;|$)/iu);
    if (match?.[1]) return validateNextUrl(match[1], config, expectedPath);
  }
  return null;
}

async function requestTimeline(
  context: ConnectorContext,
  config: MastodonConfig,
  accountId: string | null,
  checkpoint: MastodonCheckpoint,
) {
  const pathname = timelinePath(config, accountId);
  const url = checkpoint.nextUrl
    ? new URL(validateNextUrl(checkpoint.nextUrl, config, pathname))
    : apiUrl(config, pathname);
  if (!checkpoint.nextUrl) {
    url.searchParams.set("limit", String(config.itemsPerPage));
    url.searchParams.set("only_media", "true");
    if (config.mode === "ACCOUNT")
      url.searchParams.set("exclude_replies", "true");
    if (checkpoint.sinceId)
      url.searchParams.set("since_id", checkpoint.sinceId);
  }
  const result = await requestJson(
    context,
    config,
    url,
    timelineSchema,
    "SOURCE_TIMELINE_NOT_FOUND",
  );
  return {
    ...result,
    nextUrl: nextLink(result.response.headers.link, config, pathname),
  } as const;
}

function mediaDimensions(attachment: z.infer<typeof mediaAttachmentSchema>) {
  const original = attachment.meta?.original;
  if (!original)
    return { durationMilliseconds: null, height: null, width: null };
  return {
    durationMilliseconds:
      original.duration === undefined
        ? null
        : Math.round(original.duration * 1_000),
    height: original.height ?? null,
    width: original.width ?? null,
  } as const;
}

function mediaFor(
  attachments: readonly z.infer<typeof mediaAttachmentSchema>[],
  config: MastodonConfig,
): NormalizedMediaAsset[] {
  const media: NormalizedMediaAsset[] = [];
  for (const attachment of attachments) {
    if (!["image", "gifv", "video"].includes(attachment.type.toLowerCase()))
      continue;
    const remoteUrl =
      safeUrl(attachment.url, config.instanceUrl) ??
      safeUrl(attachment.remote_url, config.instanceUrl);
    if (!remoteUrl) continue;
    const type = attachment.type.toLowerCase();
    const dimensions = mediaDimensions(attachment);
    media.push(
      normalizedMediaAssetSchema.parse({
        altText: mastodonHtmlToPlainText(attachment.description, 1_000),
        ...dimensions,
        kind: type === "image" ? "IMAGE" : "VIDEO",
        mimeType:
          type === "image"
            ? null
            : /\.webm(?:$|\?)/iu.test(remoteUrl)
              ? "video/webm"
              : "video/mp4",
        previewUrl: safeUrl(attachment.preview_url, config.instanceUrl),
        remoteUrl,
      }),
    );
  }
  return media;
}

function accountHandle(
  account: z.infer<typeof accountEntitySchema>,
  host: string,
): string {
  const acct =
    mastodonHtmlToPlainText(account.acct || account.username, 255) ??
    account.username;
  return `@${acct.includes("@") ? acct : `${acct}@${host}`}`;
}

function accountAttribution(
  account: z.infer<typeof accountEntitySchema>,
  host: string,
): string {
  const handle = accountHandle(account, host);
  const displayName = mastodonHtmlToPlainText(account.display_name, 300);
  return displayName ? `${displayName} (${handle})`.slice(0, 500) : handle;
}

function languageMatches(
  actual: string | null | undefined,
  configured: string | null,
): boolean {
  if (!configured) return true;
  if (!actual) return false;
  const normalized = actual.toLowerCase();
  return normalized === configured || normalized.startsWith(`${configured}-`);
}

function normalizeStatus(
  outer: MastodonStatus,
  config: MastodonConfig,
  now: Date,
): NormalizedSourcePost | null {
  if (outer.visibility !== "public") return null;
  if (outer.reblog && !config.includeReblogs) return null;
  const status = outer.reblog ?? outer;
  if (
    status.visibility !== "public" ||
    !languageMatches(status.language, config.language)
  ) {
    return null;
  }
  const deleted = Boolean(status.deleted_at);
  const media = deleted ? [] : mediaFor(status.media_attachments, config);
  if (!deleted && media.length < config.minimumMedia) return null;
  const instanceHost = new URL(config.instanceUrl).hostname.toLowerCase();
  const originalUrl =
    safeUrl(status.url, config.instanceUrl) ??
    safeUrl(status.uri, config.instanceUrl) ??
    new URL(
      `/@${encodeURIComponent(status.account.username)}/${encodeURIComponent(status.id)}`,
      config.instanceUrl,
    ).toString();
  const summary = deleted
    ? null
    : mastodonHtmlToPlainText(status.content, 20_000);
  const warning = deleted
    ? "Deleted at the Mastodon-compatible provider."
    : (mastodonHtmlToPlainText(status.spoiler_text, 2_000) ??
      (status.sensitive
        ? "Marked sensitive by the Mastodon-compatible provider."
        : null));
  const title = deleted
    ? "Deleted Mastodon status"
    : (summary?.slice(0, 2_000) ??
      `Media post by ${accountHandle(status.account, instanceHost)}`);
  const combinedScore = Math.min(
    2_147_483_647,
    status.favourites_count + status.reblogs_count,
  );
  return normalizedSourcePostSchema.parse({
    authorName: accountAttribution(status.account, instanceHost),
    boostedBy: outer.reblog
      ? accountAttribution(outer.account, instanceHost)
      : null,
    categories: ["mastodon", config.mode.toLowerCase(), config.identifier],
    communityName: `mastodon@${instanceHost}`,
    contentRating:
      status.sensitive || status.spoiler_text.trim().length > 0
        ? "SENSITIVE"
        : "SAFE",
    contentWarning: warning,
    externalId: status.id,
    media,
    originalUrl,
    providerCommentCount: status.replies_count,
    providerCreatedAt: parseDate(status.created_at, now),
    providerDeletedAt: deleted ? parseDate(status.deleted_at, now) : null,
    providerFavouriteCount: status.favourites_count,
    providerLanguage: status.language?.slice(0, 35) ?? null,
    providerScore: combinedScore,
    providerShareCount: status.reblogs_count,
    providerUpdatedAt: status.edited_at
      ? parseDate(status.edited_at, now)
      : null,
    rawPayload: null,
    summary,
    title,
  });
}

function rateLimit(headers: Readonly<Record<string, string>>) {
  const remaining = Number(headers["x-ratelimit-remaining"]);
  const reset = headers["x-ratelimit-reset"];
  const resetMilliseconds = reset ? Date.parse(reset) : Number.NaN;
  const result = {
    ...(Number.isInteger(remaining) && remaining >= 0 ? { remaining } : {}),
    ...(Number.isFinite(resetMilliseconds)
      ? { resetAt: new Date(resetMilliseconds).toISOString() }
      : {}),
  };
  return Object.keys(result).length > 0 ? result : undefined;
}

function emptyCheckpoint(): MastodonCheckpoint {
  return {
    accountId: null,
    newestId: null,
    nextUrl: null,
    page: 1,
    seenExternalIds: [],
    sinceId: null,
  };
}

export const mastodonConnector = defineConnector({
  kind: "MASTODON",
  validateCheckpoint: (input) => mastodonCheckpointSchema.parse(input),
  validateConfig: (input) => mastodonConfigSchema.parse(input),
  validateConnectivity: async (context, config) => {
    try {
      const instance = await requestInstance(context, config);
      const account =
        config.mode === "ACCOUNT"
          ? await requestAccount(context, config)
          : null;
      const tag =
        config.mode === "HASHTAG" ? await requestTag(context, config) : null;
      await requestTimeline(
        context,
        config,
        account?.id ?? null,
        emptyCheckpoint(),
      );
      const host = new URL(config.instanceUrl).hostname.toLowerCase();
      const target = account
        ? accountHandle(account, host)
        : `#${tag?.name ?? config.identifier}`;
      return {
        details: {
          apiCompatibility: `Mastodon API ${instance.api_versions?.mastodon ?? "unreported"}`,
          instanceHost: host,
          instanceTitle: instance.title,
          instanceVersion: instance.version,
          resolvedTarget: target,
          sourceMode: config.mode,
        },
        message: `Connected to ${target} on ${host}.`,
        ok: true,
      } as const;
    } catch (error) {
      context.logger.warn("mastodon connectivity validation failed", {
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
    const accountId =
      config.mode === "ACCOUNT"
        ? (current.accountId ?? (await requestAccount(context, config)).id)
        : null;
    const result = await requestTimeline(context, config, accountId, current);
    const newestId =
      current.newestId ?? result.value.at(0)?.id ?? current.sinceId;
    const seen = new Set(current.seenExternalIds);
    const posts: NormalizedSourcePost[] = [];
    for (const status of result.value) {
      const effectiveId = (status.reblog ?? status).id;
      if (seen.has(effectiveId)) continue;
      seen.add(effectiveId);
      const post = normalizeStatus(status, config, context.clock.now());
      if (post) posts.push(post);
    }
    const pageLimit = Math.min(config.pageLimit, context.limits.maxPages);
    const hasMore = result.nextUrl !== null && current.page < pageLimit;
    const nextCheckpoint: MastodonCheckpoint = hasMore
      ? {
          accountId,
          newestId,
          nextUrl: result.nextUrl,
          page: current.page + 1,
          seenExternalIds: [...seen].slice(-100),
          sinceId: current.sinceId,
        }
      : {
          accountId,
          newestId: null,
          nextUrl: null,
          page: 1,
          seenExternalIds: [],
          sinceId: newestId,
        };
    return connectorPageSchema.parse({
      hasMore,
      nextCheckpoint,
      posts,
      rateLimit: rateLimit(result.response.headers),
    });
  },
});
