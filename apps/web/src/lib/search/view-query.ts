import { createHash } from "node:crypto";

import type { SearchParameters } from "../feed/view-query";

export const searchPageSize = 12;
const copiedParameters = [
  "q",
  "sourceId",
  "mediaKind",
  "rating",
  "tag",
  "favorite",
  "hidden",
  "seen",
  "from",
  "to",
] as const;

export function searchRequestUrl(parameters: SearchParameters): string {
  const query = new URLSearchParams();
  for (const key of copiedParameters) {
    const value = parameters[key];
    for (const item of Array.isArray(value) ? value : value ? [value] : []) {
      query.append(key, item);
    }
  }
  query.set("limit", String(searchPageSize));
  return `http://mirthspool.local/api/search?${query.toString()}`;
}

export function searchViewKey(parameters: SearchParameters): string {
  return createHash("sha256")
    .update(searchRequestUrl(parameters))
    .digest("hex")
    .slice(0, 20);
}
