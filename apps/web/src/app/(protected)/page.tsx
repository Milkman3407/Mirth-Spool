import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { FeedExperience } from "../../components/feed-experience";
import { FeedFilters } from "../../components/feed-filters";
import { getAuthenticatedSession } from "../../lib/auth/session";
import { feedPageSchema } from "../../lib/feed/client-schema";
import { readFeed } from "../../lib/feed/feed-service";
import { getFeedServices } from "../../lib/feed/server";
import {
  feedRequestUrl,
  feedViewKey,
  selectedMode,
  type SearchParameters,
} from "../../lib/feed/view-query";

export const metadata: Metadata = { title: "Feed" };
export const dynamic = "force-dynamic";

export default async function FeedPage({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParameters> }>) {
  const authentication = await getAuthenticatedSession(await headers());
  if (!authentication) redirect("/login");
  const parameters = await searchParams;
  const services = getFeedServices();
  const sourceRows = await services.database.source.findMany({
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    select: { displayName: true, id: true },
    take: 100,
    where: { deletedAt: null },
  });

  try {
    const requestUrl = feedRequestUrl(parameters);
    const page = feedPageSchema.parse(
      await readFeed(services, authentication.user.id, requestUrl),
    );
    return (
      <div className="feed-page">
        <header className="feed-intro">
          <div>
            <p className="eyebrow">Your private spool</p>
            <h1>Fresh from your sources.</h1>
          </div>
          <p>
            Remote media may contact its source host. Every card keeps the
            original attribution close by.
          </p>
        </header>
        <FeedFilters
          mode={selectedMode(parameters)}
          sources={sourceRows.map((source) => ({
            id: source.id,
            name: source.displayName,
          }))}
        />
        <FeedExperience
          apiQuery={new URL(requestUrl).searchParams.toString()}
          initialPage={page}
          key={feedViewKey(parameters)}
        />
      </div>
    );
  } catch {
    return (
      <section className="feed-query-error" role="alert">
        <p className="eyebrow">Feed query rejected</p>
        <h1>Those filters could not be used.</h1>
        <p>The URL contains an invalid or incompatible feed option.</p>
        <Link className="original-link" href="/">
          Reset the feed
        </Link>
      </section>
    );
  }
}
