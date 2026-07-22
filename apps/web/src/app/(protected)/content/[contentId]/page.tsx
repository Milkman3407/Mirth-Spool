import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { FeedCard } from "../../../../components/feed-card";
import { getAuthenticatedSession } from "../../../../lib/auth/session";
import { feedItemSchema } from "../../../../lib/feed/client-schema";
import { readContent } from "../../../../lib/feed/feed-service";
import { getFeedServices } from "../../../../lib/feed/server";

export const metadata: Metadata = { title: "Content details" };
export const dynamic = "force-dynamic";

export default async function ContentDetailPage({
  params,
}: Readonly<{ params: Promise<{ contentId: string }> }>) {
  const authentication = await getAuthenticatedSession(await headers());
  if (!authentication) redirect("/login");
  const contentId = z.uuid().safeParse((await params).contentId);
  if (!contentId.success) notFound();
  const content = await readContent(
    getFeedServices(),
    authentication.user.id,
    contentId.data,
  );
  if (!content) notFound();
  const item = feedItemSchema.parse({
    ...content,
    media: content.media[0] ?? null,
  });

  return (
    <div className="content-detail">
      <Link className="back-link" href="/">
        <span aria-hidden="true">←</span> Back to feed
      </Link>
      <FeedCard headingLevel={1} item={item} />

      <section
        className="detail-panel"
        aria-labelledby="source-attribution-title"
      >
        <p className="eyebrow">Provenance</p>
        <h2 id="source-attribution-title">Source attribution</h2>
        <ul className="attribution-list">
          {content.sources.map((occurrence) => (
            <li key={`${occurrence.source.id}:${occurrence.externalId}`}>
              <div>
                <strong>{occurrence.source.displayName}</strong>
                <span>
                  {occurrence.providerAuthor ?? "Unknown author"}
                  {occurrence.providerPublishedAt
                    ? ` · ${formatDate(occurrence.providerPublishedAt)}`
                    : ""}
                </span>
              </div>
              {occurrence.providerUrl ? (
                <a
                  href={occurrence.providerUrl}
                  referrerPolicy="no-referrer"
                  rel="external noopener noreferrer"
                  target="_blank"
                >
                  Open this occurrence <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <span>Original occurrence unavailable</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {content.tags.length > 0 ? (
        <section className="detail-panel" aria-labelledby="content-tags-title">
          <h2 id="content-tags-title">Tags</h2>
          <ul className="tag-list">
            {content.tags.map((tag) => (
              <li key={tag.slug}>{tag.label}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
