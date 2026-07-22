import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ConnectorError } from "./errors.js";
import { lemmyConfigSchema, lemmyConnector } from "./lemmy.js";
import type {
  ConnectorContext,
  HardenedHttpRequest,
  HardenedHttpResponse,
} from "./types.js";

const now = new Date("2026-07-22T13:00:00.000Z");
const community = fixture("community.json");
const firstPage = fixture("posts-page-1.json");
const secondPage = fixture("posts-page-2.json");
const missingCommunity = fixture("error-missing-community.json") as {
  error: string;
};
const malformedPosts = readFileSync(
  resolve(process.cwd(), "tests/fixtures/lemmy/malformed-posts.txt"),
  "utf8",
);
const logger = Object.freeze({ debug() {}, error() {}, info() {}, warn() {} });
const baseConfig = {
  community: "memes",
  contentPolicy: "INCLUDE_ADULT" as const,
  instanceUrl: "https://lemmy.example",
  itemsPerPage: 5,
  minimumScore: 0,
  pageLimit: 2,
  sort: "New" as const,
};

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "tests/fixtures/lemmy", name), "utf8"),
  ) as unknown;
}

function response(
  body: unknown,
  url: string,
  status = 200,
  headers: Record<string, string> = {},
): HardenedHttpResponse {
  return {
    body: Buffer.from(JSON.stringify(body)),
    headers,
    json: (schema) => schema.parse(body),
    status,
    text: () => JSON.stringify(body),
    url,
  };
}

function setup(
  handler: (request: HardenedHttpRequest) => Promise<HardenedHttpResponse>,
) {
  const requests: HardenedHttpRequest[] = [];
  const context: ConnectorContext = {
    abortSignal: new AbortController().signal,
    clock: { now: () => now },
    credentials: {},
    http: {
      request: async (request) => {
        requests.push(request);
        return handler(request);
      },
    },
    limits: {
      maxBytes: 5_000_000,
      maxItems: 100,
      maxPages: 10,
      maxRequests: 12,
    },
    logger,
  };
  return { context, requests };
}

describe("Lemmy connector", () => {
  it("validates and normalizes bounded public-community configuration", () => {
    expect(
      lemmyConfigSchema.parse({
        community: 41,
        instanceUrl: "https://LEMMY.example/",
      }),
    ).toMatchObject({
      community: "41",
      contentPolicy: "EXCLUDE_ADULT",
      instanceUrl: "https://lemmy.example",
      itemsPerPage: 20,
      pageLimit: 3,
    });
    expect(() =>
      lemmyConfigSchema.parse({
        community: "../admin",
        instanceUrl: "https://lemmy.example/path?token=nope",
      }),
    ).toThrow();
  });

  it("validates connectivity with a resolved community preview", async () => {
    const test = setup(async (request) =>
      response(community, request.url, 200, {
        "content-type": "application/json",
      }),
    );
    await expect(
      lemmyConnector.validateConnectivity(test.context, baseConfig),
    ).resolves.toEqual({
      details: {
        apiCompatibility: "Lemmy 0.19 / API v3",
        communityId: "41",
        communityName: "memes",
        communityTitle: "Synthetic Memes",
        instanceHost: "lemmy.example",
      },
      message: "Connected to memes@lemmy.example.",
      ok: true,
    });
    const url = new URL(test.requests[0]!.url);
    expect(url.pathname).toBe("/api/v3/community");
    expect(url.searchParams.get("name")).toBe("memes");
  });

  it("normalizes image, video, text, NSFW, and removed posts", async () => {
    const test = setup(async (request) =>
      response(firstPage, request.url, 200, {
        "x-ratelimit-remaining": "17",
        "x-ratelimit-reset": "2026-07-22T14:00:00.000Z",
      }),
    );
    const page = await lemmyConnector.fetchPage(test.context, baseConfig, null);
    expect(page.posts).toHaveLength(5);
    expect(page.rateLimit).toEqual({
      remaining: 17,
      resetAt: "2026-07-22T14:00:00.000Z",
    });
    expect(page.posts[0]).toMatchObject({
      authorName: "fixture_author",
      communityName: "memes@lemmy.example",
      contentRating: "SAFE",
      externalId: "1001",
      providerCommentCount: 4,
      providerScore: 42,
    });
    expect(page.posts[0]?.media[0]).toMatchObject({
      height: 480,
      kind: "IMAGE",
      mimeType: "image/png",
      width: 640,
    });
    expect(page.posts[1]?.media[0]?.kind).toBe("VIDEO");
    expect(page.posts[2]?.media[0]).toMatchObject({
      kind: "LINK",
      remoteUrl: "https://lemmy.example/post/1003",
    });
    expect(page.posts[3]).toMatchObject({
      contentRating: "ADULT",
      contentWarning: "synthetic adult marker",
    });
    expect(page.posts[4]).toMatchObject({
      contentWarning: "Removed by the Lemmy provider.",
      providerDeletedAt: now.toISOString(),
      title: "Removed Lemmy post",
    });
    expect(page.posts[4]?.media).toEqual([]);
  });

  it("applies minimum-score and conservative adult policy before persistence", async () => {
    const test = setup(async (request) => response(firstPage, request.url));
    const page = await lemmyConnector.fetchPage(
      test.context,
      {
        ...baseConfig,
        contentPolicy: "EXCLUDE_ADULT",
        minimumScore: 9,
      },
      null,
    );
    expect(page.posts.map((post) => post.externalId)).toEqual(["1001", "1002"]);
  });

  it("paginates mutable results without emitting a repeated boundary ID", async () => {
    const test = setup(async (request) => {
      const page = new URL(request.url).searchParams.get("page");
      return response(page === "1" ? firstPage : secondPage, request.url);
    });
    const pageOne = await lemmyConnector.fetchPage(
      test.context,
      baseConfig,
      null,
    );
    expect(pageOne.hasMore).toBe(true);
    const pageTwo = await lemmyConnector.fetchPage(
      test.context,
      baseConfig,
      pageOne.nextCheckpoint,
    );
    expect(pageTwo.posts.map((post) => post.externalId)).toEqual(["1006"]);
    expect(pageTwo.posts[0]?.media[0]).toMatchObject({
      kind: "LINK",
      previewUrl: "https://lemmy.example/pictrs/preview.webp",
      remoteUrl: "https://outside.example.test/article",
    });
    expect(pageTwo.nextCheckpoint).toEqual({ page: 1, seenExternalIds: [] });
    expect(test.requests).toHaveLength(2);
    expect(
      test.requests.every(
        (request) => new URL(request.url).pathname === "/api/v3/post/list",
      ),
    ).toBe(true);
    expect(
      test.requests.some((request) => request.url.includes("outside.example")),
    ).toBe(false);
  });

  it("keeps identical community names distinct by instance hostname", async () => {
    const first = setup(async (request) => response(firstPage, request.url));
    const second = setup(async (request) => response(firstPage, request.url));
    const [left, right] = await Promise.all([
      lemmyConnector.fetchPage(first.context, baseConfig, null),
      lemmyConnector.fetchPage(
        second.context,
        { ...baseConfig, instanceUrl: "https://other.example" },
        null,
      ),
    ]);
    expect(left.posts[0]?.communityName).toBe("memes@lemmy.example");
    expect(right.posts[0]?.communityName).toBe("memes@other.example");
  });

  it.each([
    [missingCommunity.error, "SOURCE_COMMUNITY_NOT_FOUND"],
    ["community_is_private", "SOURCE_COMMUNITY_RESTRICTED"],
    ["banned_from_community", "SOURCE_COMMUNITY_RESTRICTED"],
  ])("maps provider error %s to %s", async (providerCode, expectedCode) => {
    const test = setup(async (request) =>
      response({ error: providerCode }, request.url, 400),
    );
    await expect(
      lemmyConnector.validateConnectivity(test.context, baseConfig),
    ).resolves.toMatchObject({ code: expectedCode, ok: false });
  });

  it.each([
    ["SOURCE_AUTH_FAILED", "AUTHENTICATION"],
    ["SOURCE_RATE_LIMITED", "RATE_LIMITED"],
    ["MALFORMED_PROVIDER_RESPONSE", "MALFORMED_RESPONSE"],
  ] as const)("sanitizes %s failures", async (code, kind) => {
    const test = setup(async () => {
      throw new ConnectorError(kind, {
        code,
        ...(kind === "RATE_LIMITED" ? { retryAfterSeconds: 60 } : {}),
      });
    });
    await expect(
      lemmyConnector.validateConnectivity(test.context, baseConfig),
    ).resolves.toMatchObject({ code, ok: false });
  });

  it("fails closed on a malformed provider fixture", async () => {
    const test = setup(async (request) => ({
      body: Buffer.from(malformedPosts),
      headers: { "content-type": "application/json" },
      json: (schema) => schema.parse(JSON.parse(malformedPosts)),
      status: 200,
      text: () => malformedPosts,
      url: request.url,
    }));
    await expect(
      lemmyConnector.fetchPage(test.context, baseConfig, null),
    ).rejects.toMatchObject({ code: "MALFORMED_PROVIDER_RESPONSE" });
  });
});
