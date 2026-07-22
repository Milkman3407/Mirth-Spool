// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { FeedItem, FeedMedia } from "../lib/feed/client-schema";
import { FeedCard, MediaFrame, safeHttpUrl } from "./feed-card";

afterEach(cleanup);

const image: FeedMedia = {
  altText: "A synthetic test image",
  byteLength: "128",
  durationMs: null,
  height: 480,
  id: "00000000-0000-4000-8000-000000000002",
  kind: "IMAGE",
  mimeType: "image/png",
  remoteUrl: "https://media.example.test/image.png",
  width: 640,
};

const item: FeedItem = {
  alternateSourceCount: 1,
  authorName: "Fixture author",
  contentRating: "ADULT",
  contentWarning: "Synthetic adult marker",
  id: "00000000-0000-4000-8000-000000000001",
  media: image,
  primarySource: {
    displayName: "Synthetic feed",
    kind: "RSS",
    providerUrl: "https://example.test/original",
    sourceId: "00000000-0000-4000-8000-000000000003",
  },
  publishedAt: "2026-07-22T00:00:00.000Z",
  summary: null,
  title: "Synthetic item",
};

describe("feed media presentation", () => {
  it("shows and restores an item-scoped content warning", () => {
    render(createElement(FeedCard, { item }));
    const reveal = screen.getByRole("button", { name: "Reveal this item" });
    expect(reveal.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(reveal);
    expect(
      screen
        .getByRole("button", { name: "Hide restricted media" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("falls back safely when remote media fails", () => {
    render(
      createElement(MediaFrame, {
        media: image,
        originalUrl: "https://example.test/original",
        title: "Test",
      }),
    );
    fireEvent.error(screen.getByRole("img", { name: image.altText! }));
    expect(screen.getByText("Media could not be loaded")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open original" }).getAttribute("rel"),
    ).toContain("noopener");
  });

  it("renders video muted with controls and without autoplay", () => {
    const { container } = render(
      createElement(MediaFrame, {
        media: { ...image, kind: "VIDEO", mimeType: "video/mp4" },
        originalUrl: "https://example.test/original",
        title: "Video test",
      }),
    );
    const video = container.querySelector("video");
    expect(video?.muted).toBe(true);
    expect(video?.controls).toBe(true);
    expect(video?.autoplay).toBe(false);
    expect(video?.preload).toBe("metadata");
    fireEvent.error(video!);
    expect(screen.getByText("Media could not be loaded")).toBeTruthy();
  });

  it("renders provider markup as text and never creates active elements", () => {
    const { container } = render(
      createElement(FeedCard, {
        item: {
          ...item,
          contentRating: "SAFE",
          title: '<img src=x><script>alert("x")</script>',
        },
      }),
    );
    expect(
      screen.getByText('<img src=x><script>alert("x")</script>'),
    ).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
  });

  it("rejects active or malformed media URLs", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl("https://example.test/media.png")).toBe(
      "https://example.test/media.png",
    );
  });
});
