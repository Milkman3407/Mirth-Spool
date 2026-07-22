// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FeedPage } from "../lib/feed/client-schema";
import { FeedExperience } from "./feed-experience";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const emptyPage: FeedPage = { hasMore: false, items: [], nextCursor: null };
const item = {
  actionState: {
    favorite: false,
    hidden: false,
    viewed: false,
    view: null,
  },
  alternateSourceCount: 0,
  authorName: null,
  contentRating: "SAFE" as const,
  contentWarning: null,
  id: "00000000-0000-4000-8000-000000000001",
  media: null,
  primarySource: null,
  publishedAt: "2026-07-22T00:00:00.000Z",
  summary: null,
  title: "First item",
};

describe("feed loading states", () => {
  it("renders a useful empty state", () => {
    render(
      createElement(FeedExperience, {
        apiQuery: "mode=new&limit=12",
        initialPage: emptyPage,
      }),
    );
    expect(screen.getByText("No items match this view")).toBeTruthy();
  });

  it("shows loading and recoverable error states", async () => {
    let rejectFetch: ((reason: Error) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((_resolve, reject) => {
            rejectFetch = reject;
          }),
      ),
    );
    render(
      createElement(FeedExperience, {
        apiQuery: "mode=new&limit=12",
        initialPage: { hasMore: true, items: [item], nextCursor: "cursor" },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(screen.getByRole("status").textContent).toContain(
      "Loading more posts",
    );
    rejectFetch?.(new Error("synthetic failure"));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "That page did not load",
    );
    expect(screen.getByRole("button", { name: "Retry loading" })).toBeTruthy();
  });
});
