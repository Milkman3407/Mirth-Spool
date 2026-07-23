import {
  queryLibrary,
  readSetting,
  readUserPreferences,
  type LibraryKind,
} from "../../../../../packages/db/dist/index";

import { presentFeedItem, ratingsFor } from "../feed/feed-service";
import { decodeLibraryCursor, encodeLibraryCursor } from "./cursor";
import { parseLibraryQuery } from "./schemas";

type Services = Readonly<{
  database: Parameters<typeof queryLibrary>[0];
  secret: string;
}>;

export class HistoryDisabledError extends Error {
  constructor() {
    super("HISTORY_DISABLED");
    this.name = "HistoryDisabledError";
  }
}

export async function readLibrary(
  services: Services,
  userId: string,
  kind: LibraryKind,
  url: string,
  now = new Date(),
) {
  const query = parseLibraryQuery(url);
  const [ceiling, preferences] = await Promise.all([
    readSetting(services.database, "content.maximumRating"),
    readUserPreferences(services.database, userId),
  ]);
  const historyEnabled = preferences.historyEnabled;
  if (kind === "history" && !historyEnabled) throw new HistoryDisabledError();
  const cursor = query.cursor
    ? decodeLibraryCursor(query.cursor, services.secret)
    : undefined;
  if (cursor && cursor.k !== kind) throw new Error("INVALID_CURSOR");
  const page = await queryLibrary(services.database, {
    allowedRatings: [
      ...ratingsFor(ceiling, undefined, preferences.maximumContentRating),
    ],
    kind,
    limit: query.limit,
    ...(cursor
      ? {
          position: {
            id: cursor.i,
            timestamp: new Date(cursor.t),
          },
        }
      : {}),
    userId,
  });
  const last = page.rows.at(-1);
  const timestamp =
    kind === "history" ? last?.lastOccurredAt : last?.occurredAt;
  return Object.freeze({
    hasMore: page.hasMore,
    items: page.rows.map((row) =>
      presentFeedItem(row.contentItem, now, false, historyEnabled),
    ),
    nextCursor:
      page.hasMore && last && timestamp
        ? encodeLibraryCursor(
            { i: last.id, k: kind, t: timestamp.toISOString(), v: 1 },
            services.secret,
          )
        : null,
  });
}
