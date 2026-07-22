import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { FeedExperience } from "../../../components/feed-experience";
import { SearchFilters } from "../../../components/search-filters";
import { getAuthenticatedSession } from "../../../lib/auth/session";
import { feedPageSchema } from "../../../lib/feed/client-schema";
import type { SearchParameters } from "../../../lib/feed/view-query";
import { readSearch } from "../../../lib/search/search-service";
import { getSearchServices } from "../../../lib/search/server";
import {
  searchRequestUrl,
  searchViewKey,
} from "../../../lib/search/view-query";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParameters> }>) {
  const authentication = await getAuthenticatedSession(await headers());
  if (!authentication) redirect("/login");
  const parameters = await searchParams;
  const services = getSearchServices();
  const [sources, tags] = await Promise.all([
    services.database.source.findMany({
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
      select: { displayName: true, id: true },
      take: 100,
      where: { deletedAt: null },
    }),
    services.database.tag.findMany({
      orderBy: [{ label: "asc" }, { id: "asc" }],
      select: { label: true, slug: true },
      take: 200,
    }),
  ]);
  try {
    const requestUrl = searchRequestUrl(parameters);
    const page = feedPageSchema.parse(
      await readSearch(services, authentication.user.id, requestUrl, {
        allowHidden: authentication.user.role === "ADMIN",
      }),
    );
    return (
      <div className="search-page">
        <header className="feed-intro">
          <div>
            <p className="eyebrow">Private discovery</p>
            <h1>Search your spool.</h1>
          </div>
          <p>Every result keeps its source attribution and content policy.</p>
        </header>
        <SearchFilters
          allowHidden={authentication.user.role === "ADMIN"}
          sources={sources.map((source) => ({
            id: source.id,
            name: source.displayName,
          }))}
          tags={tags}
        />
        <FeedExperience
          apiPath="/api/search"
          apiQuery={new URL(requestUrl).searchParams.toString()}
          initialPage={page}
          key={searchViewKey(parameters)}
        />
      </div>
    );
  } catch {
    return (
      <section className="feed-query-error" role="alert">
        <p className="eyebrow">Search rejected</p>
        <h1>That search could not be used.</h1>
        <p>Queries are limited to 200 characters and 20 searchable tokens.</p>
        <Link className="original-link" href="/search">
          Clear the search
        </Link>
      </section>
    );
  }
}
