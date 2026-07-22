import {
  querySearch,
  readSetting,
  type ContentRating,
  type SearchQuery,
} from "../../../../../packages/db/dist/index";

import { presentFeedItem, ratingsFor } from "../feed/feed-service";
import { decodeSearchCursor, encodeSearchCursor } from "./cursor";
import { parseSearchQuery } from "./schemas";

type Services = Readonly<{
  database: Parameters<typeof querySearch>[0];
  secret: string;
}>;

export async function readSearch(
  services: Services,
  userId: string,
  url: string,
  options: { readonly allowHidden: boolean; readonly now?: Date },
) {
  const parsed = parseSearchQuery(url);
  if (parsed.hidden && !options.allowHidden)
    throw new Error("FORBIDDEN_FILTER");
  const ceiling = await readSetting(services.database, "content.maximumRating");
  const allowedRatings = requestedRatings(
    ratingsFor(ceiling),
    parsed.requestedRatings,
  );
  const cursor = parsed.cursor
    ? decodeSearchCursor(parsed.cursor, services.secret)
    : undefined;
  if (cursor && cursor.f !== parsed.fingerprint) {
    throw new Error("INVALID_CURSOR");
  }
  const query: SearchQuery = {
    allowedRatings,
    ...(parsed.favorite === undefined ? {} : { favorite: parsed.favorite }),
    ...(parsed.from ? { from: parsed.from } : {}),
    ...(parsed.hidden === undefined ? {} : { hidden: parsed.hidden }),
    limit: parsed.limit,
    mediaKinds: parsed.kinds,
    ...(cursor
      ? {
          position: {
            id: cursor.i,
            publishedAt: new Date(cursor.p),
            rank: cursor.r,
          },
        }
      : {}),
    ...(parsed.queryText ? { queryText: parsed.queryText } : {}),
    ...(parsed.seen === undefined ? {} : { seen: parsed.seen }),
    sourceIds: parsed.sourceIds,
    tags: parsed.tags,
    ...(parsed.to ? { to: parsed.to } : {}),
    userId,
  };
  const page = await querySearch(services.database, query);
  const last = page.rows.at(-1)?.position;
  return Object.freeze({
    hasMore: page.hasMore,
    items: page.rows.map(({ item }) =>
      presentFeedItem(item, options.now ?? new Date(), false, true),
    ),
    nextCursor:
      page.hasMore && last
        ? encodeSearchCursor(
            {
              f: parsed.fingerprint,
              i: last.id,
              p: last.publishedAt.toISOString(),
              r: last.rank,
              v: 1,
            },
            services.secret,
          )
        : null,
  });
}

function requestedRatings(
  allowed: readonly ContentRating[],
  requested: readonly ContentRating[],
): readonly ContentRating[] {
  if (requested.length === 0) return allowed;
  const permitted = new Set(allowed);
  return requested.filter((rating) => permitted.has(rating));
}
