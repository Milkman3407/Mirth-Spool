import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  mastodonConfigSchema,
  mastodonConnector,
  mastodonHtmlToPlainText,
} from "./mastodon.js";
import type {
  ConnectorContext,
  ConnectorHttpClient,
  HardenedHttpResponse,
} from "./types.js";

const instance = fixture("instance.json");
const account = fixture("account.json");
const tag = fixture("tag.json");
const hashtagPage = fixture("hashtag-page-1.json");
const accountPage = fixture("account-page.json");
const secondPage = fixture("page-2.json");

describe("mastodon connector", () => {
  it("normalizes bounded hashtag, local-account, and remote-account config", () => {
    expect(config({ identifier: "#Memes", mode: "HASHTAG" })).toMatchObject({
      identifier: "Memes",
      itemsPerPage: 20,
      minimumMedia: 1,
    });
    expect(config({ identifier: "@artist", mode: "ACCOUNT" }).identifier).toBe(
      "artist",
    );
    expect(
      config({ identifier: "@artist@remote.example", mode: "ACCOUNT" })
        .identifier,
    ).toBe("artist@remote.example");
  });

  it("rejects path-bearing origins, invalid identifiers, and excessive limits", () => {
    expect(() =>
      config({ instanceUrl: "https://mastodon.example/path" }),
    ).toThrow();
    expect(() => config({ identifier: "bad tag!" })).toThrow();
    expect(() => config({ itemsPerPage: 41 })).toThrow();
    expect(() => config({ pageLimit: 11 })).toThrow();
  });

  it("validates a public hashtag with instance capability diagnostics", async () => {
    const requests: string[] = [];
    const result = await mastodonConnector.validateConnectivity(
      context(async (request) => {
        requests.push(request.url);
        const url = new URL(request.url);
        if (url.pathname === "/api/v2/instance")
          return response(instance, request.url);
        if (url.pathname === "/api/v1/tags/Memes")
          return response(tag, request.url);
        return response([], request.url);
      }),
      config(),
    );
    expect(result).toMatchObject({
      details: {
        apiCompatibility: "Mastodon API 8",
        resolvedTarget: "#Memes",
      },
      ok: true,
    });
    expect(requests).toHaveLength(3);
    expect(requests.at(-1)).toContain("only_media=true");
  });

  it("resolves public local and remote-style account handles", async () => {
    for (const identifier of ["artist", "artist@remote.example"]) {
      const requested: string[] = [];
      const result = await mastodonConnector.validateConnectivity(
        context(async (request) => {
          requested.push(request.url);
          const url = new URL(request.url);
          if (url.pathname === "/api/v2/instance")
            return response(instance, request.url);
          if (url.pathname === "/api/v1/accounts/lookup") {
            return response(
              {
                ...(account as Record<string, unknown>),
                acct: identifier,
              },
              request.url,
            );
          }
          return response([], request.url);
        }),
        config({ identifier, mode: "ACCOUNT" }),
      );
      expect(result.ok).toBe(true);
      expect(requested[1]).toContain(`acct=${encodeURIComponent(identifier)}`);
      expect(requested[2]).toContain("/api/v1/accounts/acct-41/statuses");
    }
  });

  it("normalizes public media, counters, warnings, edits, alt text, and XSS as plain text", async () => {
    const page = await mastodonConnector.fetchPage(
      context(async (request) => response(hashtagPage, request.url)),
      config(),
      null,
    );
    expect(page.posts.map((post) => post.externalId)).toEqual(["9001", "7001"]);
    const post = page.posts[0]!;
    expect(post).toMatchObject({
      contentRating: "SENSITIVE",
      contentWarning: "Flashing & synthetic",
      providerCommentCount: 3,
      providerFavouriteCount: 5,
      providerLanguage: "en",
      providerScore: 9,
      providerShareCount: 4,
      providerUpdatedAt: "2026-07-22T16:05:00.000Z",
    });
    expect(post.authorName).toBe(
      "Synthetic & Artist (@artist@mastodon.example)",
    );
    expect(post.summary).toBe("Hello world .");
    expect(post.media).toHaveLength(2);
    expect(post.media[0]).toMatchObject({
      altText: "A safe & bounded alt",
      height: 600,
      kind: "IMAGE",
      width: 800,
    });
    expect(post.media[1]).toMatchObject({
      durationMilliseconds: 2_500,
      kind: "VIDEO",
    });
    expect(JSON.stringify(post)).not.toMatch(/script|onerror|javascript/iu);
    expect(page.posts[1]).toMatchObject({
      media: [],
      providerDeletedAt: "2026-07-22T17:00:00.000Z",
      summary: null,
    });
  });

  it("deduplicates boosts under the original status while preserving booster attribution", async () => {
    const first = await mastodonConnector.fetchPage(
      context(async (request) =>
        response(hashtagPage, request.url, {
          link: '<https://mastodon.example/api/v1/timelines/tag/Memes?limit=20&max_id=8001>; rel="next"',
        }),
      ),
      config({ includeReblogs: true }),
      null,
    );
    expect(first.posts.map((post) => post.externalId)).toContain("8001");
    expect(
      first.posts.find((post) => post.externalId === "8001"),
    ).toMatchObject({
      boostedBy: "Booster (@booster@remote.example)",
      providerFavouriteCount: 9,
      providerShareCount: 7,
    });
    const second = await mastodonConnector.fetchPage(
      context(async (request) => response(secondPage, request.url)),
      config({ includeReblogs: true }),
      first.nextCheckpoint,
    );
    expect(second.posts.map((post) => post.externalId)).toEqual(["5001"]);
    expect(second.nextCheckpoint).toMatchObject({
      nextUrl: null,
      page: 1,
      seenExternalIds: [],
      sinceId: "9001",
    });
  });

  it("rejects pagination links outside the configured origin or timeline path", async () => {
    for (const link of [
      '<https://evil.example/api/v1/timelines/tag/Memes?max_id=1>; rel="next"',
      '<https://mastodon.example/api/v1/instance?max_id=1>; rel="next"',
    ]) {
      await expect(
        mastodonConnector.fetchPage(
          context(async (request) =>
            response(hashtagPage, request.url, { link }),
          ),
          config({ includeReblogs: true }),
          null,
        ),
      ).rejects.toMatchObject({ code: "SOURCE_PAGINATION_ORIGIN_REJECTED" });
    }
  });

  it("filters account statuses by language and keeps instance-aware attribution", async () => {
    const page = await mastodonConnector.fetchPage(
      context(async (request) =>
        new URL(request.url).pathname === "/api/v1/accounts/lookup"
          ? response(account, request.url)
          : response(accountPage, request.url),
      ),
      config({ identifier: "artist", language: "fr", mode: "ACCOUNT" }),
      null,
    );
    expect(page.posts).toHaveLength(1);
    expect(page.posts[0]).toMatchObject({
      communityName: "mastodon@mastodon.example",
      providerLanguage: "fr",
    });
    expect(page.nextCheckpoint).toMatchObject({ accountId: "acct-41" });
  });

  it("enforces media-only normalization even when a provider ignores only_media", async () => {
    const statuses = structuredClone(hashtagPage) as Array<
      Record<string, unknown>
    >;
    const first = statuses[0]!;
    first.media_attachments = [
      {
        description: "Audio only",
        id: "audio",
        meta: null,
        preview_url: null,
        type: "audio",
        url: "https://files.example.test/audio.mp3",
      },
    ];
    const page = await mastodonConnector.fetchPage(
      context(async (request) => response(statuses, request.url)),
      config(),
      null,
    );
    expect(page.posts.map((post) => post.externalId)).toEqual(["7001"]);
  });

  it("maps public-preview restrictions and rate limits to safe stable errors", async () => {
    const restricted = await mastodonConnector.validateConnectivity(
      context(async (request) =>
        response(
          { error: "token detail must not escape" },
          request.url,
          {},
          401,
        ),
      ),
      config(),
    );
    expect(restricted).toMatchObject({
      code: "SOURCE_PUBLIC_TIMELINE_RESTRICTED",
      ok: false,
    });
    expect(JSON.stringify(restricted)).not.toContain("token detail");

    const limited = await mastodonConnector.validateConnectivity(
      context(async (request) =>
        response(
          { error: "Rate limit exceeded" },
          request.url,
          { "retry-after": "120" },
          429,
        ),
      ),
      config(),
    );
    expect(limited).toMatchObject({
      code: "SOURCE_RATE_LIMITED",
      ok: false,
      retryAfterSeconds: 120,
    });
  });

  it("rejects malformed provider payloads with a stable code", async () => {
    await expect(
      mastodonConnector.fetchPage(
        context(async (request) => response([{ id: "broken" }], request.url)),
        config(),
        null,
      ),
    ).rejects.toMatchObject({ code: "MALFORMED_PROVIDER_RESPONSE" });
  });

  it("reduces malformed and active markup to bounded inert plain text", () => {
    expect(
      mastodonHtmlToPlainText(
        "<p>Hello &lt;friend&gt;</p><script>alert(1)</script><img src=x onerror=alert(2)>tail",
        100,
      ),
    ).toBe("Hello <friend> tail");
    expect(mastodonHtmlToPlainText("&#x1f600; text", 6)).toBe("😀 tex");
  });
});

function config(overrides: Record<string, unknown> = {}) {
  return mastodonConfigSchema.parse({
    identifier: "Memes",
    instanceUrl: "https://mastodon.example",
    mode: "HASHTAG",
    ...overrides,
  });
}

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), `tests/fixtures/mastodon/${name}`),
      "utf8",
    ),
  );
}

function context(request: ConnectorHttpClient["request"]): ConnectorContext {
  return {
    abortSignal: new AbortController().signal,
    clock: { now: () => new Date("2026-07-22T18:00:00.000Z") },
    credentials: {},
    http: { request },
    limits: { maxBytes: 5_000_000, maxItems: 100, maxPages: 3, maxRequests: 8 },
    logger: { debug() {}, error() {}, info() {}, warn() {} },
  };
}

function response(
  value: unknown,
  url: string,
  headers: Readonly<Record<string, string>> = {},
  status = 200,
): HardenedHttpResponse {
  return {
    body: Buffer.from(JSON.stringify(value)),
    headers: { "content-type": "application/json", ...headers },
    json: (schema) => schema.parse(value),
    status,
    text: () => JSON.stringify(value),
    url,
  };
}
