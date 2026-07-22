import { describe, expect, it } from "vitest";

import { isPublicApiPath, safeReturnPath } from "./guards";

describe("route guards", () => {
  it("permits only local return paths", () => {
    expect(safeReturnPath("/sources?tab=health")).toBe("/sources?tab=health");
    expect(safeReturnPath("https://attacker.invalid")).toBe("/");
    expect(safeReturnPath("//attacker.invalid")).toBe("/");
    expect(safeReturnPath("/\\attacker.invalid")).toBe("/");
  });

  it("keeps the public API surface narrow", () => {
    expect(isPublicApiPath("/api/health/live")).toBe(true);
    expect(isPublicApiPath("/api/setup/status")).toBe(true);
    expect(isPublicApiPath("/api/auth/get-session")).toBe(true);
    expect(isPublicApiPath("/api/settings")).toBe(false);
    expect(isPublicApiPath("/api/media/example")).toBe(false);
  });
});
