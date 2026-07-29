import { createHash } from "node:crypto";

import { XMLParser, XMLValidator } from "fast-xml-parser";
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

const feedUrlSchema = z
  .url()
  .max(2_048)
  .refine((value) => {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  }, "Feed URL must be an HTTP(S) URL without embedded credentials");

export const rssConfigSchema = z
  .object({
    feedUrl: feedUrlSchema,
    maxEntries: z.number().int().min(1).max(100).default(50),
  })
  .strict();

export const rssCheckpointSchema = z
  .object({
    etag: z.string().trim().min(1).max(500).optional(),
    lastModified: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

type RssConfig = z.infer<typeof rssConfigSchema>;
type RssCheckpoint = z.infer<typeof rssCheckpointSchema>;
type XmlRecord = Record<string, unknown>;

const expectedFeedTypes = [
  "application/atom+xml",
  "application/rdf+xml",
  "application/rss+xml",
  "application/xml",
  "text/xml",
] as const;

const parser = new XMLParser({
  attributeNamePrefix: "@",
  htmlEntities: false,
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: false,
  removeNSPrefix: false,
  trimValues: true,
});

function record(value: unknown): XmlRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as XmlRecord)
    : undefined;
}

function array(value: unknown): unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number")
    return String(value).trim() || undefined;
  const object = record(value);
  return object ? text(object["#text"]) : undefined;
}

function stripMarkup(value: string): string {
  let result = "";
  let insideTag = false;
  let quote: '"' | "'" | null = null;
  let tag = "";
  let suppressedDepth = 0;
  for (const character of value) {
    if (!insideTag) {
      if (character === "<") {
        insideTag = true;
        tag = "";
      } else if (suppressedDepth === 0) {
        result += character;
      }
      continue;
    }
    tag += character;
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      insideTag = false;
      const match = /^\s*(\/?)\s*([a-z0-9]+)/iu.exec(tag);
      const name = match?.[2]?.toLowerCase();
      if (name === "script" || name === "style") {
        if (match?.[1]) suppressedDepth = Math.max(0, suppressedDepth - 1);
        else if (!tag.trimEnd().endsWith("/>")) suppressedDepth += 1;
      }
      if (suppressedDepth === 0) result += " ";
    }
  }
  return result;
}

function cleanText(value: unknown, max: number): string | null {
  const source = text(value);
  if (!source) return null;
  const cleaned = stripMarkup(source)
    .replace(/&(?:nbsp|#160);/giu, " ")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&amp;/giu, "&")
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
  return cleaned ? cleaned.slice(0, max) : null;
}

function safeUrl(value: unknown, base: string): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate, base);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    const result = url.toString();
    return result.length <= 2_048 ? result : null;
  } catch {
    return null;
  }
}

function assertSafeXml(xml: string): void {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(xml)) {
    throw new ConnectorError("MALFORMED_RESPONSE", {
      code: "SOURCE_XML_UNSAFE",
    });
  }
  if (XMLValidator.validate(xml) !== true) {
    throw new ConnectorError("MALFORMED_RESPONSE", {
      code: "SOURCE_XML_MALFORMED",
    });
  }
  let depth = 0;
  for (const token of xml.matchAll(/<\/?([A-Za-z_][\w:.-]*)\b[^>]*>/gu)) {
    const raw = token[0];
    if (raw.startsWith("</")) depth -= 1;
    else if (!raw.endsWith("/>")) depth += 1;
    if (depth > 64 || depth < 0) {
      throw new ConnectorError("MALFORMED_RESPONSE", {
        code: "SOURCE_XML_DEPTH_LIMIT",
      });
    }
  }
}

function parseDate(value: unknown, fallback: Date): string {
  const candidate = text(value);
  if (candidate) {
    const milliseconds = Date.parse(candidate);
    if (Number.isFinite(milliseconds))
      return new Date(milliseconds).toISOString();
  }
  return fallback.toISOString();
}

function categories(entry: XmlRecord): string[] {
  const values = array(entry.category).map((value) => {
    const object = record(value);
    return cleanText(object?.["@term"] ?? value, 200);
  });
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ].slice(0, 50);
}

function ratingFor(entry: XmlRecord, values: readonly string[]): ContentRating {
  const explicit = [entry.rating, entry["media:rating"], ...values].map(
    (value) => text(value)?.toLowerCase(),
  );
  if (
    explicit.some(
      (value) => value && /\b(?:adult|explicit|nsfw|porn)\b/u.test(value),
    )
  )
    return "ADULT";
  if (
    explicit.some(
      (value) =>
        value &&
        /\b(?:sensitive|spoiler|violence|content warning)\b/u.test(value),
    )
  )
    return "SENSITIVE";
  if (
    explicit.some(
      (value) => value && /\b(?:safe|clean|nonadult)\b/u.test(value),
    )
  )
    return "SAFE";
  return "UNKNOWN";
}

function mediaKind(
  mimeType: string | null,
  url: string,
): NormalizedMediaAsset["kind"] {
  const normalized = mimeType?.toLowerCase();
  if (
    normalized?.startsWith("video/") ||
    /\.(?:mp4|webm|mov)(?:$|\?)/iu.test(url)
  )
    return "VIDEO";
  if (normalized === "image/gif" || /\.gif(?:$|\?)/iu.test(url))
    return "ANIMATED_IMAGE";
  if (
    normalized?.startsWith("image/") ||
    /\.(?:avif|jpe?g|png|webp)(?:$|\?)/iu.test(url)
  )
    return "IMAGE";
  return "LINK";
}

function asset(value: unknown, base: string): NormalizedMediaAsset | null {
  const object = record(value);
  const remoteUrl = safeUrl(
    object?.["@url"] ?? object?.["@href"] ?? value,
    base,
  );
  if (!remoteUrl) return null;
  const mimeType = cleanText(object?.["@type"], 200);
  const byteLengthText = text(object?.["@length"] ?? object?.["@fileSize"]);
  const byteLength =
    byteLengthText && /^\d{1,12}$/u.test(byteLengthText)
      ? Number(byteLengthText)
      : null;
  return normalizedMediaAssetSchema.parse({
    altText: cleanText(object?.["@description"], 1_000),
    byteLength:
      byteLength !== null && byteLength <= 250_000_000 ? byteLength : null,
    kind: mediaKind(mimeType, remoteUrl),
    mimeType,
    remoteUrl,
  });
}

function htmlAssets(value: unknown, base: string): NormalizedMediaAsset[] {
  const html = text(value)?.slice(0, 50_000);
  if (!html) return [];
  const results: NormalizedMediaAsset[] = [];
  for (const match of html.matchAll(
    /<(img|video|source)\b[^>]{0,2000}\b(?:src|poster)\s*=\s*["']([^"']{1,2048})["'][^>]*>/giu,
  )) {
    const remoteUrl = safeUrl(match[2], base);
    if (!remoteUrl) continue;
    results.push(
      normalizedMediaAssetSchema.parse({
        kind:
          match[1]?.toLowerCase() === "img"
            ? mediaKind(null, remoteUrl)
            : "VIDEO",
        remoteUrl,
      }),
    );
    if (results.length >= 20) break;
  }
  return results;
}

function entryLink(entry: XmlRecord, base: string): string | null {
  const links = array(entry.link);
  const alternate = links.find((value) => {
    const link = record(value);
    return !link?.["@rel"] || text(link["@rel"]) === "alternate";
  });
  return safeUrl(record(alternate)?.["@href"] ?? alternate, base);
}

function entryMedia(
  entry: XmlRecord,
  base: string,
  originalUrl: string,
): NormalizedMediaAsset[] {
  const candidates = [
    ...array(entry.enclosure),
    ...array(entry["media:content"]),
    ...array(entry["media:thumbnail"]),
    ...array(entry.link).filter(
      (value) => text(record(value)?.["@rel"]) === "enclosure",
    ),
  ];
  const assets = [
    ...candidates
      .map((value) => asset(value, base))
      .filter((value): value is NormalizedMediaAsset => value !== null),
    ...htmlAssets(
      entry["content:encoded"] ??
        entry.content ??
        entry.description ??
        entry.summary,
      base,
    ),
  ];
  const unique = [
    ...new Map(assets.map((value) => [value.remoteUrl, value])).values(),
  ].slice(0, 20);
  return unique.length > 0
    ? unique
    : [
        normalizedMediaAssetSchema.parse({
          kind: "LINK",
          remoteUrl: originalUrl,
        }),
      ];
}

function externalId(
  entry: XmlRecord,
  originalUrl: string,
  title: string | null,
  summary: string | null,
): string {
  const explicit = cleanText(entry.guid ?? entry.id, 1_024);
  if (explicit) return explicit;
  if (originalUrl) return originalUrl;
  return `rss:fallback:${createHash("sha256")
    .update(JSON.stringify([title, summary]))
    .digest("hex")}`;
}

function parseFeed(xml: string, base: string, now: Date, maxEntries: number) {
  if (Buffer.byteLength(xml, "utf8") > 5_000_000) {
    throw new ConnectorError("MALFORMED_RESPONSE", {
      code: "SOURCE_RESPONSE_TOO_LARGE",
    });
  }
  assertSafeXml(xml);
  let document: XmlRecord;
  try {
    document = record(parser.parse(xml)) ?? {};
  } catch (error) {
    throw new ConnectorError("MALFORMED_RESPONSE", {
      cause: error,
      code: "SOURCE_XML_MALFORMED",
    });
  }
  const rss = record(document.rss);
  const rdf = record(document["rdf:RDF"]);
  const atom = record(document.feed);
  const channel = record(rss?.channel) ?? rdf;
  const feed = channel ?? atom;
  if (!feed)
    throw new ConnectorError("MALFORMED_RESPONSE", {
      code: "SOURCE_FEED_UNSUPPORTED",
    });
  const format = atom ? "Atom" : "RSS";
  const feedTitle = cleanText(feed.title, 500) ?? "Untitled feed";
  const rawEntries = (atom ? array(feed.entry) : array(feed.item)).slice(
    0,
    maxEntries,
  );
  const posts: NormalizedSourcePost[] = [];
  const seen = new Set<string>();
  for (const value of rawEntries) {
    const entry = record(value);
    if (!entry) continue;
    const resolvedLink = entryLink(entry, base);
    const originalUrl = resolvedLink ?? safeUrl(base, base);
    if (!originalUrl) continue;
    const title = cleanText(entry.title, 2_000);
    const summary = cleanText(
      entry.summary ??
        entry.description ??
        entry["content:encoded"] ??
        entry.content,
      20_000,
    );
    const id = externalId(entry, resolvedLink ?? "", title, summary);
    if (seen.has(id)) continue;
    seen.add(id);
    const entryCategories = categories(entry);
    const author = record(entry.author);
    posts.push(
      normalizedSourcePostSchema.parse({
        authorName: cleanText(
          author?.name ?? entry.author ?? entry["dc:creator"],
          500,
        ),
        categories: entryCategories,
        communityName: feedTitle,
        contentRating: ratingFor(entry, entryCategories),
        contentWarning: cleanText(
          entry["content:warning"] ?? entry["media:description"],
          2_000,
        ),
        externalId: id,
        media: entryMedia(entry, base, originalUrl),
        originalUrl,
        providerCreatedAt: parseDate(
          entry.published ?? entry.pubDate ?? entry.updated ?? entry["dc:date"],
          now,
        ),
        providerUpdatedAt: entry.updated ? parseDate(entry.updated, now) : null,
        rawPayload: null,
        summary,
        title,
      }),
    );
  }
  return { feedTitle, format, posts } as const;
}

async function requestFeed(
  context: ConnectorContext,
  config: RssConfig,
  checkpoint: RssCheckpoint | null,
) {
  const headers: Record<string, string> = {
    accept: expectedFeedTypes.join(", "),
  };
  if (checkpoint?.etag) headers["if-none-match"] = checkpoint.etag;
  if (checkpoint?.lastModified)
    headers["if-modified-since"] = checkpoint.lastModified;
  return context.http.request({
    acceptedStatuses: [304],
    expectedContentTypes: expectedFeedTypes,
    headers,
    signal: context.abortSignal,
    url: config.feedUrl,
  });
}

export const rssConnector = defineConnector({
  kind: "RSS",
  validateCheckpoint: (input) => rssCheckpointSchema.parse(input),
  validateConfig: (input) => rssConfigSchema.parse(input),
  validateConnectivity: async (context, config) => {
    try {
      const response = await requestFeed(context, config, null);
      const parsed = parseFeed(
        response.text(),
        response.url,
        context.clock.now(),
        Math.min(config.maxEntries, 5),
      );
      return {
        details: {
          feedFormat: parsed.format,
          feedTitle: parsed.feedTitle,
          sampleItemCount: String(parsed.posts.length),
        },
        message: `Connected to ${parsed.feedTitle}.`,
        ok: true,
      } as const;
    } catch (error) {
      context.logger.warn("rss connectivity validation failed", {
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
      return { code: safe.code, message: safe.message, ok: false as const };
    }
  },
  fetchPage: async (context, config, checkpoint) => {
    const response = await requestFeed(context, config, checkpoint);
    if (response.status === 304) {
      return connectorPageSchema.parse({
        hasMore: false,
        nextCheckpoint: checkpoint ?? {},
        posts: [],
      });
    }
    const parsed = parseFeed(
      response.text(),
      response.url,
      context.clock.now(),
      Math.min(config.maxEntries, context.limits.maxItems),
    );
    const etag = response.headers.etag?.trim();
    const lastModified = response.headers["last-modified"]?.trim();
    return connectorPageSchema.parse({
      hasMore: false,
      nextCheckpoint: rssCheckpointSchema.parse({
        ...(etag ? { etag } : {}),
        ...(lastModified ? { lastModified } : {}),
      }),
      posts: parsed.posts,
    });
  },
});
