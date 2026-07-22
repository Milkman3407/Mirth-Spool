import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  redditConfigSchema,
  redditConnector,
  redditCredentialSchema,
} from "./reddit.js";
import type {
  ConnectorContext,
  ConnectorHttpClient,
  ConnectorOAuthToken,
  HardenedHttpResponse,
} from "./types.js";

const token = fixture("token.json");
const about = fixture("about.json");
const firstListing = fixture("listing-page-1.json");
const secondListing = fixture("listing-page-2.json");
const malformed = fixture("malformed.txt");

describe("reddit connector", () => {
  it("validates bounded subreddit configuration and OAuth credentials", () => {
    expect(config({ subreddit: "r/MirthFixtures" })).toMatchObject({
      contentPolicy: "EXCLUDE_ADULT",
      subreddit: "MirthFixtures",
    });
    expect(() => config({ subreddit: "bad-name!" })).toThrow();
    expect(() => config({ itemsPerPage: 101 })).toThrow();
    expect(() =>
      redditCredentialSchema.parse({ ...credentials, userAgent: "generic" }),
    ).toThrow();
  });

  it("uses app-only OAuth read scope, a descriptive user agent, and cached tokens", async () => {
    const requested: Array<{
      body?: string;
      headers?: Readonly<Record<string, string>>;
      url: string;
      userAgent?: string;
    }> = [];
    let acquisitions = 0;
    const ctx = context(async (request) => {
      requested.push({
        ...(request.body
          ? { body: new TextDecoder().decode(request.body) }
          : {}),
        ...(request.headers ? { headers: request.headers } : {}),
        url: request.url,
        ...(request.userAgent ? { userAgent: request.userAgent } : {}),
      });
      const url = new URL(request.url);
      if (url.pathname === "/api/v1/access_token") {
        acquisitions += 1;
        return response(token, request.url);
      }
      if (url.pathname.endsWith("/about")) return response(about, request.url);
      return response(firstListing, request.url);
    });
    const result = await redditConnector.validateConnectivity(ctx, config());
    expect(result).toMatchObject({
      details: { credentialHealth: "valid", subreddit: "r/MirthFixtures" },
      ok: true,
    });
    await redditConnector.fetchPage(ctx, config(), null);
    expect(acquisitions).toBe(1);
    expect(requested[0]?.body).toBe("grant_type=client_credentials&scope=read");
    expect(
      requested.every((request) => request.userAgent === credentials.userAgent),
    ).toBe(true);
    expect(
      requested.some((request) =>
        request.headers?.authorization?.startsWith("Bearer "),
      ),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain("fixture-access-token");
  });

  it("normalizes direct images, galleries, hosted video, links, and crossposts deterministically", async () => {
    const page = await redditConnector.fetchPage(
      context(provider(firstListing)),
      config({ contentPolicy: "INCLUDE_ADULT" }),
      null,
    );
    expect(page.posts.map((post) => post.externalId)).toEqual([
      "t3_img1",
      "t3_gallery1",
      "t3_video1",
      "t3_link1",
      "t3_cross1",
      "t3_adult1",
      "t3_removed1",
    ]);
    expect(page.posts[0]?.media[0]).toMatchObject({
      kind: "IMAGE",
      remoteUrl: "https://i.redd.it/fixture.png",
    });
    expect(page.posts[1]?.media.map((media) => media.kind)).toEqual([
      "IMAGE",
      "ANIMATED_IMAGE",
    ]);
    expect(page.posts[1]).toMatchObject({
      contentRating: "SENSITIVE",
      contentWarning: "Marked as a spoiler by Reddit.",
    });
    expect(page.posts[2]?.media[0]).toMatchObject({
      durationMilliseconds: 12_000,
      height: 720,
      kind: "VIDEO",
      width: 1280,
    });
    expect(page.posts[3]?.media[0]).toMatchObject({
      kind: "LINK",
      remoteUrl: "https://example.net/story",
    });
    expect(page.posts[4]).toMatchObject({
      authorName: "crossposter",
      externalId: "t3_cross1",
      title: "Crosspost title",
    });
    expect(page.posts[4]?.media[0]?.remoteUrl).toBe(
      "https://i.redd.it/original.jpg",
    );
    expect(page.posts[5]?.contentRating).toBe("ADULT");
    expect(page.posts[6]).toMatchObject({
      authorName: null,
      media: [],
      providerDeletedAt: "2026-07-22T18:00:00.000Z",
      title: "Removed Reddit post",
    });
  });

  it("filters minimum score, stickied, and adult posts without bypassing provider controls", async () => {
    const page = await redditConnector.fetchPage(
      context(provider(firstListing)),
      config({ minimumScore: 25 }),
      null,
    );
    expect(page.posts.map((post) => post.externalId)).toEqual([
      "t3_img1",
      "t3_gallery1",
      "t3_video1",
    ]);
    const sensitive = await redditConnector.fetchPage(
      context(provider(firstListing)),
      config({
        contentPolicy: "TREAT_ADULT_AS_SENSITIVE",
        includeStickied: true,
      }),
      null,
    );
    expect(
      sensitive.posts.find((post) => post.externalId === "t3_adult1")
        ?.contentRating,
    ).toBe("SENSITIVE");
    expect(sensitive.posts.map((post) => post.externalId)).toContain(
      "t3_sticky1",
    );
  });

  it("uses bounded after pagination, deduplicates IDs, and records rate state", async () => {
    const urls: string[] = [];
    const first = await redditConnector.fetchPage(
      context(async (request) => {
        urls.push(request.url);
        return provider(firstListing)(request);
      }),
      config(),
      null,
    );
    expect(first).toMatchObject({ hasMore: true, rateLimit: { remaining: 0 } });
    expect(first.rateLimit?.resetAt).toBe("2026-07-22T18:02:00.000Z");
    const secondPayload = structuredClone(secondListing) as {
      data: { children: unknown[] };
    };
    secondPayload.data.children.unshift(
      (firstListing as { data: { children: unknown[] } }).data.children[0],
    );
    const second = await redditConnector.fetchPage(
      context(async (request) => {
        urls.push(request.url);
        return provider(secondPayload)(request);
      }),
      config(),
      first.nextCheckpoint,
    );
    expect(urls.at(-1)).toContain("after=t3_page2");
    expect(second.posts.map((post) => post.externalId)).toEqual(["t3_page2"]);
    expect(second.hasMore).toBe(false);
  });

  it("classifies missing, private, quarantined, authentication, rate, and malformed responses safely", async () => {
    const cases = [
      {
        status: 404,
        body: { message: "Not Found" },
        code: "SOURCE_REDDIT_SUBREDDIT_NOT_FOUND",
      },
      {
        status: 403,
        body: { message: "Forbidden", reason: "private" },
        code: "SOURCE_REDDIT_PRIVATE",
      },
      {
        status: 403,
        body: { message: "Forbidden", reason: "quarantined" },
        code: "SOURCE_REDDIT_QUARANTINED",
      },
      {
        status: 403,
        body: { message: "Forbidden", reason: "banned" },
        code: "SOURCE_REDDIT_BANNED",
      },
      {
        status: 401,
        body: { message: "secret detail" },
        code: "SOURCE_REDDIT_AUTH_FAILED",
      },
      {
        status: 429,
        body: { message: "limited" },
        code: "SOURCE_REDDIT_RATE_LIMITED",
      },
    ];
    for (const testCase of cases) {
      const result = await redditConnector.validateConnectivity(
        context(async (request) =>
          new URL(request.url).pathname === "/api/v1/access_token"
            ? response(token, request.url)
            : response(
                testCase.body,
                request.url,
                { "retry-after": "90" },
                testCase.status,
              ),
        ),
        config(),
      );
      expect(result).toMatchObject({ code: testCase.code, ok: false });
      expect(JSON.stringify(result)).not.toContain("secret detail");
    }
    const oauthFailure = await redditConnector.validateConnectivity(
      context(async (request) =>
        response({ error: "invalid_grant" }, request.url, {}, 400),
      ),
      config(),
    );
    expect(oauthFailure).toMatchObject({
      code: "SOURCE_REDDIT_AUTH_FAILED",
      ok: false,
    });
    expect(JSON.stringify(oauthFailure)).not.toContain("invalid_grant");
    await expect(
      redditConnector.fetchPage(context(provider(malformed)), config(), null),
    ).rejects.toMatchObject({ code: "SOURCE_REDDIT_MALFORMED_RESPONSE" });
  });

  it("rejects private/quarantined about metadata even when the endpoint returns 200", async () => {
    for (const data of [
      { ...(about as { data: object }).data, subreddit_type: "private" },
      { ...(about as { data: object }).data, quarantine: true },
    ]) {
      const result = await redditConnector.validateConnectivity(
        context(async (request) =>
          new URL(request.url).pathname === "/api/v1/access_token"
            ? response(token, request.url)
            : new URL(request.url).pathname.endsWith("/about")
              ? response({ kind: "t5", data }, request.url)
              : response(firstListing, request.url),
        ),
        config(),
      );
      expect(result.ok).toBe(false);
    }
  });
});

const credentials = {
  clientId: "fixture_client_id",
  clientSecret: "fixture-client-secret-not-real",
  userAgent: "linux:mirthspool:v0.1 (by /u/fixture_admin)",
} as const;

function config(overrides: Record<string, unknown> = {}) {
  return redditConfigSchema.parse({ subreddit: "MirthFixtures", ...overrides });
}

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), `tests/fixtures/reddit/${name}`),
      "utf8",
    ),
  );
}

function provider(listing: unknown): ConnectorHttpClient["request"] {
  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/v1/access_token")
      return response(token, request.url);
    return response(listing, request.url, {
      "x-ratelimit-remaining": "0.9",
      "x-ratelimit-reset": "120",
    });
  };
}

function context(request: ConnectorHttpClient["request"]): ConnectorContext {
  let cached: ConnectorOAuthToken | undefined;
  return {
    abortSignal: new AbortController().signal,
    clock: { now: () => new Date("2026-07-22T18:00:00.000Z") },
    credentials: { primary: credentials },
    http: { request },
    limits: { maxBytes: 5_000_000, maxItems: 100, maxPages: 3, maxRequests: 8 },
    logger: { debug() {}, error() {}, info() {}, warn() {} },
    tokenCache: {
      getOrCreate: async (_key, acquire) => {
        cached ??= await acquire();
        return cached;
      },
    },
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
