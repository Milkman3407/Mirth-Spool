import { createHash } from "node:crypto";

import {
  feedModeSchema,
  mediaKindSchema,
  type FeedMode,
} from "./client-schema";

export const feedPageSize = 12;
const copiedParameters = [
  "mode",
  "sourceId",
  "mediaKind",
  "rating",
  "from",
  "to",
  "tag",
  "includeSeen",
] as const;

export type SearchParameters = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

export function feedRequestUrl(parameters: SearchParameters): string {
  const query = new URLSearchParams();
  for (const key of copiedParameters) {
    const value = parameters[key];
    for (const item of Array.isArray(value) ? value : value ? [value] : [])
      query.append(key, item);
  }
  query.set("limit", String(feedPageSize));
  return `http://mirthspool.local/api/feed?${query.toString()}`;
}

export function feedViewKey(parameters: SearchParameters): string {
  return createHash("sha256")
    .update(feedRequestUrl(parameters))
    .digest("hex")
    .slice(0, 20);
}

export function selectedMode(parameters: SearchParameters): FeedMode {
  const value = single(parameters.mode);
  return feedModeSchema.catch("new").parse(value);
}

export function selectedMediaKind(
  parameters: SearchParameters,
): "" | "IMAGE" | "ANIMATED_IMAGE" | "VIDEO" | "LINK" {
  const value = single(parameters.mediaKind)?.toUpperCase();
  return value && mediaKindSchema.safeParse(value).success
    ? (value as "IMAGE" | "ANIMATED_IMAGE" | "VIDEO" | "LINK")
    : "";
}

export function single(value: string | readonly string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
