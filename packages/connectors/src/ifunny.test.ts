import { describe, expect, it } from "vitest";

import { ConnectorError } from "./errors.js";
import { ifunnyConfigSchema, ifunnyConnector } from "./ifunny.js";
import type { ConnectorContext, HardenedHttpRequest } from "./types.js";

const now = new Date("2026-07-28T12:00:00.000Z");
const logger = Object.freeze({ debug() {}, error() {}, info() {}, warn() {} });

const fixture = `<!doctype html><html><body>
<div data-meme-id="image123">
  <div><img alt="A &amp; B" data-src="https://img.getfn.io/images/image_1.jpg">
    <a title="A &amp; B" href="https://ifunny.co/picture/a-b-image123" data-meme-link="true"></a>
  </div>
  <a href="/user/MemeMaker"><span>MemeMaker</span></a>
  <div>2h</div>
  <button aria-label="Add smile"><span>Add smile</span><span>3.7K</span></button>
</div>
<div class="card" data-meme-id="video456">
  <video data-poster="https://img.getfn.io/images/video_3.jpg" data-src="https://img.getfn.io/videos/video_1.mp4" aria-label="Funny clip video"></video>
  <a href="https://ifunny.co/video/video456" title="Funny clip" data-meme-link="true"></a>
  <a href="/user/ClipMaker"><span>ClipMaker</span></a>
  <div>1d</div>
  <button aria-label="Add smile"><span>11K</span></button>
</div>
</body></html>`;

function context(
  html = fixture,
  failure?: ConnectorError,
): { requests: HardenedHttpRequest[]; value: ConnectorContext } {
  const requests: HardenedHttpRequest[] = [];
  return {
    requests,
    value: {
      abortSignal: new AbortController().signal,
      clock: { now: () => now },
      credentials: {},
      http: {
        request: async (request) => {
          requests.push(request);
          if (failure) throw failure;
          return {
            body: Buffer.from(html),
            headers: { "content-type": "text/html" },
            json: () => {
              throw new Error("unused");
            },
            status: 200,
            text: () => html,
            url: "https://ifunny.co/top-memes/day",
          };
        },
      },
      limits: {
        maxBytes: 5_000_000,
        maxItems: 100,
        maxPages: 1,
        maxRequests: 1,
      },
      logger,
    },
  };
}

describe("iFunny daily top-memes connector", () => {
  it("validates a bounded configuration", () => {
    expect(ifunnyConfigSchema.parse({})).toEqual({ maxEntries: 25 });
    expect(() => ifunnyConfigSchema.parse({ maxEntries: 51 })).toThrow();
    expect(() =>
      ifunnyConfigSchema.parse({ url: "https://example.test" }),
    ).toThrow();
  });

  it("normalizes lazy images, videos, authors, scores, and relative ages", async () => {
    const setup = context();
    const page = await ifunnyConnector.fetchPage(
      setup.value,
      { maxEntries: 25 },
      null,
    );
    expect(page).toMatchObject({ hasMore: false, nextCheckpoint: {} });
    expect(page.posts).toHaveLength(2);
    expect(page.posts[0]).toMatchObject({
      authorName: "MemeMaker",
      externalId: "image123",
      originalUrl: "https://ifunny.co/picture/a-b-image123",
      providerCreatedAt: "2026-07-28T10:00:00.000Z",
      providerScore: 3700,
      title: "A & B",
    });
    expect(page.posts[0]?.media[0]).toMatchObject({
      kind: "IMAGE",
      remoteUrl: "https://img.getfn.io/images/image_1.jpg",
    });
    expect(page.posts[1]?.media[0]).toMatchObject({
      kind: "VIDEO",
      previewUrl: "https://img.getfn.io/images/video_3.jpg",
      remoteUrl: "https://img.getfn.io/videos/video_1.mp4",
    });
    expect(setup.requests[0]).toMatchObject({
      expectedContentTypes: ["text/html"],
      url: "https://ifunny.co/top-memes/day",
    });
    expect(setup.requests[0]?.userAgent).toContain("MirthSpool/0.1");
  });

  it("caps validation samples and maps safe transport errors", async () => {
    const setup = context();
    await expect(
      ifunnyConnector.validateConnectivity(setup.value, { maxEntries: 25 }),
    ).resolves.toEqual({
      details: {
        collection: "top memes of the day",
        sampleItemCount: "2",
      },
      message: "Connected to iFunny top memes of the day.",
      ok: true,
    });
    const failed = context(
      fixture,
      new ConnectorError("TRANSIENT", {
        code: "SOURCE_REQUEST_TIMEOUT",
      }),
    );
    await expect(
      ifunnyConnector.validateConnectivity(failed.value, { maxEntries: 25 }),
    ).resolves.toMatchObject({
      code: "SOURCE_REQUEST_TIMEOUT",
      ok: false,
    });
  });

  it("rejects unsupported markup and untrusted media hosts", async () => {
    await expect(
      ifunnyConnector.fetchPage(
        context("<html></html>").value,
        { maxEntries: 5 },
        null,
      ),
    ).rejects.toMatchObject({ code: "SOURCE_IFUNNY_MARKUP_UNSUPPORTED" });
    const untrusted = fixture.replaceAll(
      "https://img.getfn.io",
      "https://evil.example",
    );
    await expect(
      ifunnyConnector.fetchPage(
        context(untrusted).value,
        { maxEntries: 5 },
        null,
      ),
    ).rejects.toMatchObject({ code: "SOURCE_IFUNNY_NO_SUPPORTED_POSTS" });
  });
});
