// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContentActions } from "./content-actions";

const initialState = {
  favorite: false,
  hidden: false,
  viewed: false,
  view: null,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("content actions", () => {
  it("rolls an optimistic favorite back when the server rejects it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("synthetic")));
    render(
      <ContentActions
        contentId="00000000-0000-4000-8000-000000000001"
        initialState={initialState}
      />,
    );
    const button = screen.getByRole("button", { name: "Add to favorites" });
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => {
      expect(
        screen
          .getByRole("button", { name: "Add to favorites" })
          .getAttribute("aria-pressed"),
      ).toBe("false");
    });
    expect(screen.getByRole("alert").textContent).toContain("restored");
  });

  it("optimistically exposes the requested hide state to a parent", async () => {
    let resolveRequest: (() => void) | undefined;
    const onActionRequest = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    render(
      <ContentActions
        contentId="00000000-0000-4000-8000-000000000001"
        initialState={initialState}
        onActionRequest={onActionRequest}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Hide item" }));
    expect(onActionRequest).toHaveBeenCalledWith("hide", true);
    expect(
      screen
        .getByRole("button", { name: "Unhide item" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    resolveRequest?.();
  });
});
