import { describe, expect, it } from "vitest";

import { ConnectorError } from "./errors.js";
import { rssConnector } from "./rss.js";
import type { ConnectorContext, HardenedHttpRequest } from "./types.js";

const now = new Date("2026-01-02T03:04:05.000Z");
const logger = Object.freeze({ debug() {}, error() {}, info() {}, warn() {} });

function context(
  xml: string,
  headers: Record<string, string> = {},
  status = 200,
) {
  const requests: HardenedHttpRequest[] = [];
  const value: ConnectorContext = {
    abortSignal: new AbortController().signal,
    clock: { now: () => now },
    credentials: {},
    http: {
      request: async (request) => {
        requests.push(request);
        return {
          body: Buffer.from(xml),
          headers,
          json: () => {
            throw new Error("unused");
          },
          status,
          text: () => xml,
          url: "https://feeds.example/memes/feed.xml",
        };
      },
    },
    limits: { maxBytes: 5_000_000, maxItems: 100, maxPages: 1, maxRequests: 1 },
    logger,
  };
  return { requests, value };
}

describe("RSS and Atom connector", () => {
  it("normalizes RSS media, relative URLs, ratings, and duplicate IDs", async () => {
    const fixture = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Safe Memes</title><item><guid>same</guid><title><![CDATA[<b>First</b>]]></title><link>/posts/1</link><pubDate>Thu, 01 Jan 2026 12:00:00 GMT</pubDate><category>nsfw</category><enclosure url="/media/1.gif" type="image/gif" length="123"/><media:thumbnail url="/media/thumb.jpg"/></item><item><guid>same</guid><link>/posts/duplicate</link></item></channel></rss>`;
    const { value } = context(fixture, {
      etag: '"v1"',
      "last-modified": "Thu, 01 Jan 2026 12:00:00 GMT",
    });
    const page = await rssConnector.fetchPage(
      value,
      { feedUrl: "https://feeds.example/feed.xml", maxEntries: 50 },
      null,
    );
    expect(page.posts).toHaveLength(1);
    expect(page.posts[0]).toMatchObject({
      categories: ["nsfw"],
      contentRating: "ADULT",
      externalId: "same",
      originalUrl: "https://feeds.example/posts/1",
      providerCreatedAt: "2026-01-01T12:00:00.000Z",
      title: "First",
    });
    expect(page.posts[0]?.media.map((asset) => asset.kind)).toEqual([
      "ANIMATED_IMAGE",
      "IMAGE",
    ]);
    expect(page.nextCheckpoint).toEqual({
      etag: '"v1"',
      lastModified: "Thu, 01 Jan 2026 12:00:00 GMT",
    });
  });

  it("normalizes Atom HTML media, malformed dates, and stable link IDs", async () => {
    const fixture = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom feed</title><entry><title>Entry</title><link rel="alternate" href="posts/2"/><author><name>Ada</name></author><updated>not-a-date</updated><summary><![CDATA[Look <img src="../image.png" onerror="bad()">]]></summary><category term="sensitive"/></entry></feed>`;
    const first = await rssConnector.fetchPage(
      context(fixture).value,
      { feedUrl: "https://feeds.example/memes/feed.xml", maxEntries: 10 },
      null,
    );
    const second = await rssConnector.fetchPage(
      context(fixture).value,
      { feedUrl: "https://feeds.example/memes/feed.xml", maxEntries: 10 },
      null,
    );
    expect(first.posts[0]).toMatchObject({
      authorName: "Ada",
      contentRating: "SENSITIVE",
      externalId: "https://feeds.example/memes/posts/2",
      providerCreatedAt: now.toISOString(),
      summary: "Look",
    });
    expect(first.posts[0]?.media[0]?.remoteUrl).toBe(
      "https://feeds.example/image.png",
    );
    expect(second.posts[0]?.externalId).toBe(first.posts[0]?.externalId);
  });

  it("returns an empty page for 304 and sends conditional headers", async () => {
    const setup = context("", {}, 304);
    const checkpoint = { etag: '"v2"', lastModified: "yesterday" };
    const page = await rssConnector.fetchPage(
      setup.value,
      { feedUrl: "https://feeds.example/feed", maxEntries: 10 },
      checkpoint,
    );
    expect(page).toMatchObject({ posts: [], nextCheckpoint: checkpoint });
    expect(setup.requests[0]).toMatchObject({
      acceptedStatuses: [304],
      headers: { "if-modified-since": "yesterday", "if-none-match": '"v2"' },
    });
  });

  it("creates a stable hash ID for an entry without an ID or link", async () => {
    const fixture =
      "<rss><channel><title>Hash feed</title><item><title>Same title</title><description>Same body</description></item></channel></rss>";
    const first = await rssConnector.fetchPage(
      context(fixture).value,
      { feedUrl: "https://feeds.example/feed", maxEntries: 10 },
      null,
    );
    const second = await rssConnector.fetchPage(
      context(fixture).value,
      { feedUrl: "https://feeds.example/feed", maxEntries: 10 },
      null,
    );
    expect(first.posts[0]?.externalId).toMatch(/^rss:fallback:[a-f0-9]{64}$/u);
    expect(first.posts[0]?.externalId).toBe(second.posts[0]?.externalId);
    expect(first.posts[0]?.originalUrl).toBe(
      "https://feeds.example/memes/feed.xml",
    );
  });

  it("rejects XML beyond the connector hard limit", async () => {
    const setup = context(
      `<rss><channel><title>${"x".repeat(5_000_001)}</title></channel></rss>`,
    );
    await expect(
      rssConnector.validateConnectivity(setup.value, {
        feedUrl: "https://feeds.example/feed",
        maxEntries: 10,
      }),
    ).resolves.toMatchObject({ code: "SOURCE_RESPONSE_TOO_LARGE", ok: false });
  });

  it.each([
    ["malformed", "<rss><channel><item></channel></rss>"],
    ["doctype", '<!DOCTYPE rss [<!ENTITY x "boom">]><rss><channel/></rss>'],
    ["entity", '<!ENTITY x "boom"><rss><channel/></rss>'],
    ["unsupported", "<html><body>not a feed</body></html>"],
  ])("rejects unsafe or %s XML", async (_name, fixture) => {
    const result = await rssConnector.validateConnectivity(
      context(fixture).value,
      { feedUrl: "https://feeds.example/feed", maxEntries: 10 },
    );
    expect(result.ok).toBe(false);
  });

  it("validates empty feeds without fetching media", async () => {
    const setup = context(
      '<rss version="2.0"><channel><title>Empty</title></channel></rss>',
    );
    await expect(
      rssConnector.validateConnectivity(setup.value, {
        feedUrl: "https://feeds.example/feed",
        maxEntries: 10,
      }),
    ).resolves.toEqual({
      details: { feedFormat: "RSS", feedTitle: "Empty", sampleItemCount: "0" },
      message: "Connected to Empty.",
      ok: true,
    });
    expect(setup.requests).toHaveLength(1);
  });

  it("maps transport failures to safe connectivity errors", async () => {
    const setup = context("");
    setup.value.http.request = async () => {
      throw new ConnectorError("TRANSIENT", { code: "SOURCE_REQUEST_TIMEOUT" });
    };
    await expect(
      rssConnector.validateConnectivity(setup.value, {
        feedUrl: "https://feeds.example/feed",
        maxEntries: 10,
      }),
    ).resolves.toMatchObject({ code: "SOURCE_REQUEST_TIMEOUT", ok: false });
  });
});
