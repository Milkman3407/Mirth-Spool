import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { LibraryKind } from "../../../../packages/db/dist/index";
import { getAuthenticatedSession } from "../lib/auth/session";
import { feedPageSchema } from "../lib/feed/client-schema";
import {
  HistoryDisabledError,
  readLibrary,
} from "../lib/library/library-service";
import { getLibraryServices } from "../lib/library/server";
import { LibraryExperience } from "./library-experience";

const copy = {
  favorites: {
    empty: "Save a post from the feed or a detail view to keep it here.",
    eyebrow: "Saved posts",
    title: "Favorites",
  },
  hidden: {
    empty: "Items you hide from normal feeds will appear here for restoration.",
    eyebrow: "Private controls",
    title: "Hidden items",
  },
  history: {
    empty:
      "Posts will appear after a meaningful view or an explicit detail visit.",
    eyebrow: "Private browsing data",
    title: "View history",
  },
} as const;

export async function LibraryPage({
  kind,
  searchParams,
}: Readonly<{
  kind: LibraryKind;
  searchParams: Promise<
    Readonly<Record<string, string | readonly string[] | undefined>>
  >;
}>) {
  const authentication = await getAuthenticatedSession(await headers());
  if (!authentication) redirect("/login");
  const parameters = await searchParams;
  const cursor = Array.isArray(parameters.cursor)
    ? parameters.cursor[0]
    : parameters.cursor;
  const request = new URL(`http://mirthspool.local/api/library/${kind}`);
  request.searchParams.set("limit", "12");
  if (cursor) request.searchParams.set("cursor", cursor);
  const labels = copy[kind];

  try {
    const page = feedPageSchema.parse(
      await readLibrary(
        getLibraryServices(),
        authentication.user.id,
        kind,
        request.toString(),
      ),
    );
    const nextHref = page.nextCursor
      ? `/library/${kind}?cursor=${encodeURIComponent(page.nextCursor)}`
      : null;
    return (
      <div className="library-page">
        <header className="feed-intro">
          <div>
            <p className="eyebrow">{labels.eyebrow}</p>
            <h1>{labels.title}</h1>
          </div>
          <p>These actions are private to your authenticated account.</p>
        </header>
        <LibraryExperience
          emptyMessage={labels.empty}
          items={page.items}
          kind={kind}
          nextHref={nextHref}
        />
      </div>
    );
  } catch (error) {
    if (error instanceof HistoryDisabledError) {
      return (
        <section className="panel">
          <p className="eyebrow">Private browsing data</p>
          <h1>View history is disabled</h1>
          <p>
            MirthSpool is not recording detailed views. Unseen currently shows
            the normal unhidden feed.
          </p>
          <Link className="original-link" href="/settings">
            Review history settings
          </Link>
        </section>
      );
    }
    return (
      <section className="feed-query-error" role="alert">
        <p className="eyebrow">Library query rejected</p>
        <h1>This library page could not be loaded.</h1>
        <p>The cursor is invalid or no longer matches this library.</p>
        <Link className="original-link" href={`/library/${kind}`}>
          Return to the first page
        </Link>
      </section>
    );
  }
}
