// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShareOriginal } from "./share-original";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("original-link sharing", () => {
  it("passes only the attributed URL to Web Share", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, share });
    render(
      createElement(ShareOriginal, {
        title: "Fixture",
        url: "https://example.test/original",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Share original" }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: "Fixture",
        url: "https://example.test/original",
      }),
    );
  });

  it("copies the attributed URL as the fallback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(
      createElement(ShareOriginal, {
        title: "Fixture",
        url: "https://example.test/original",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("https://example.test/original"),
    );
  });
});
