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

const dailyUrl = "https://ifunny.co/top-memes/day";
const browserCompatibleUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 MirthSpool/0.1";

export const ifunnyConfigSchema = z
  .object({
    maxEntries: z.number().int().min(1).max(50).default(25),
  })
  .strict();

const ifunnyCheckpointSchema = z.object({}).strict();

type IfunnyConfig = z.infer<typeof ifunnyConfigSchema>;

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d{1,7});/gu, (_match, digits: string) =>
      String.fromCodePoint(Math.min(Number(digits), 0x10ffff)),
    )
    .replace(/&#x([a-f0-9]{1,6});/giu, (_match, digits: string) =>
      String.fromCodePoint(Math.min(Number.parseInt(digits, 16), 0x10ffff)),
    )
    .replace(/&quot;/giu, '"')
    .replace(/&apos;|&#39;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&amp;/giu, "&")
    .replace(/\s+/gu, " ")
    .trim();
}

function attribute(fragment: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = fragment.match(
    new RegExp(`\\b${escapedName}\\s*=\\s*(["'])(.*?)\\1`, "isu"),
  );
  return match?.[2] ? decodeHtml(match[2]) : null;
}

function safeUrl(
  value: string | null,
  expectedHost: (hostname: string) => boolean,
): string | null {
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !expectedHost(url.hostname.toLowerCase())
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

function score(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/([\d,.]+)\s*([km])?/iu);
  if (!match?.[1]) return null;
  const parsed = Number(match[1].replaceAll(",", ""));
  if (!Number.isFinite(parsed)) return null;
  const multiplier =
    match[2]?.toLowerCase() === "m"
      ? 1_000_000
      : match[2]?.toLowerCase() === "k"
        ? 1_000
        : 1;
  return Math.max(0, Math.round(parsed * multiplier));
}

function relativeDate(fragment: string, now: Date): string {
  const match = fragment.match(/>\s*(\d{1,3})([mhd])\s*<\/div>/iu);
  if (!match?.[1] || !match[2]) return now.toISOString();
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const milliseconds =
    amount * (unit === "d" ? 86_400_000 : unit === "h" ? 3_600_000 : 60_000);
  return new Date(now.valueOf() - milliseconds).toISOString();
}

function mediaFor(fragment: string): NormalizedMediaAsset | null {
  const videoTag = fragment.match(/<video\b[^>]{0,5000}>/iu)?.[0];
  if (videoTag) {
    const remoteUrl = safeUrl(
      attribute(videoTag, "data-src") ?? attribute(videoTag, "src"),
      (hostname) => hostname === "img.getfn.io",
    );
    if (!remoteUrl) return null;
    const previewUrl = safeUrl(
      attribute(videoTag, "data-poster") ?? attribute(videoTag, "poster"),
      (hostname) => hostname === "img.getfn.io",
    );
    return normalizedMediaAssetSchema.parse({
      altText: attribute(videoTag, "aria-label"),
      kind: "VIDEO",
      mimeType: "video/mp4",
      previewUrl,
      remoteUrl,
    });
  }
  const imageTags = fragment.match(/<img\b[^>]{0,5000}>/giu) ?? [];
  for (const imageTag of imageTags) {
    if (attribute(imageTag, "alt")?.endsWith(" avatar")) continue;
    const remoteUrl = safeUrl(
      attribute(imageTag, "data-src") ?? attribute(imageTag, "src"),
      (hostname) => hostname === "img.getfn.io",
    );
    if (!remoteUrl) continue;
    return normalizedMediaAssetSchema.parse({
      altText: attribute(imageTag, "alt"),
      kind: /\.gif(?:$|\?)/iu.test(remoteUrl) ? "ANIMATED_IMAGE" : "IMAGE",
      remoteUrl,
    });
  }
  return null;
}

function parseDailyPage(
  html: string,
  now: Date,
  maxEntries: number,
): NormalizedSourcePost[] {
  if (Buffer.byteLength(html, "utf8") > 5_000_000) {
    throw new ConnectorError("MALFORMED_RESPONSE", {
      code: "SOURCE_RESPONSE_TOO_LARGE",
    });
  }
  const starts = [
    ...html.matchAll(
      /<div\b[^>]{0,1000}\bdata-meme-id\s*=\s*(["'])([A-Za-z0-9_-]{5,100})\1[^>]*>/giu,
    ),
  ];
  if (starts.length === 0) {
    throw new ConnectorError("MALFORMED_RESPONSE", {
      code: "SOURCE_IFUNNY_MARKUP_UNSUPPORTED",
    });
  }
  const posts: NormalizedSourcePost[] = [];
  const seen = new Set<string>();
  for (
    let index = 0;
    index < starts.length && posts.length < maxEntries;
    index += 1
  ) {
    const start = starts[index];
    const id = start?.[2];
    if (!id || seen.has(id) || start.index === undefined) continue;
    const end = starts[index + 1]?.index ?? html.length;
    const fragment = html.slice(start.index, end);
    const linkTag = fragment.match(
      /<a\b[^>]{0,5000}\bdata-meme-link\s*=\s*(["'])true\1[^>]*>/iu,
    )?.[0];
    const originalUrl = safeUrl(
      linkTag ? attribute(linkTag, "href") : null,
      (hostname) => hostname === "ifunny.co",
    );
    const media = mediaFor(fragment);
    if (!linkTag || !originalUrl || !media) continue;
    const title = attribute(linkTag, "title")?.slice(0, 2_000) ?? null;
    const userTag = fragment.match(
      /<a\b[^>]{0,2000}\bhref\s*=\s*(["'])\/user\/[^"']+\1[^>]*>[\s\S]{0,1000}?<\/a>/iu,
    )?.[0];
    const scoreFragment = fragment.match(
      /<button\b[^>]{0,2000}\baria-label\s*=\s*(["'])Add smile\1[^>]*>[\s\S]{0,2000}?<\/button>/iu,
    )?.[0];
    seen.add(id);
    posts.push(
      normalizedSourcePostSchema.parse({
        authorName: userTag
          ? decodeHtml(userTag.replace(/<[^>]+>/gu, " ")).slice(0, 500)
          : null,
        categories: ["top-memes", "day"],
        communityName: "iFunny top memes of the day",
        contentRating: "UNKNOWN",
        externalId: id,
        media: [media],
        originalUrl,
        providerCreatedAt: relativeDate(fragment, now),
        providerScore: score(
          scoreFragment
            ? decodeHtml(scoreFragment.replace(/<[^>]+>/gu, " "))
            : null,
        ),
        rawPayload: null,
        summary: title,
        title,
      }),
    );
  }
  if (posts.length === 0) {
    throw new ConnectorError("MALFORMED_RESPONSE", {
      code: "SOURCE_IFUNNY_NO_SUPPORTED_POSTS",
    });
  }
  return posts;
}

async function requestDaily(context: ConnectorContext) {
  return context.http.request({
    expectedContentTypes: ["text/html"],
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
    },
    signal: context.abortSignal,
    url: dailyUrl,
    userAgent: browserCompatibleUserAgent,
  });
}

export const ifunnyConnector = defineConnector({
  kind: "IFUNNY",
  validateCheckpoint: (input) => ifunnyCheckpointSchema.parse(input),
  validateConfig: (input) => ifunnyConfigSchema.parse(input),
  validateConnectivity: async (context, config: IfunnyConfig) => {
    try {
      const response = await requestDaily(context);
      const posts = parseDailyPage(
        response.text(),
        context.clock.now(),
        Math.min(config.maxEntries, 5),
      );
      return {
        details: {
          collection: "top memes of the day",
          sampleItemCount: String(posts.length),
        },
        message: "Connected to iFunny top memes of the day.",
        ok: true,
      } as const;
    } catch (error) {
      context.logger.warn("ifunny connectivity validation failed", {
        errorCode:
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : undefined,
      });
      const safe = safeConnectorFailure(error);
      return {
        code: safe.code,
        message: safe.message,
        ok: false,
        ...(safe.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: safe.retryAfterSeconds }),
      } as const;
    }
  },
  fetchPage: async (context, config: IfunnyConfig) => {
    const response = await requestDaily(context);
    return connectorPageSchema.parse({
      hasMore: false,
      nextCheckpoint: {},
      posts: parseDailyPage(
        response.text(),
        context.clock.now(),
        config.maxEntries,
      ),
    });
  },
});
