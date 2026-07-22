import { describe, expect, it } from "vitest";

import { getSettingDefault, validateSetting } from "./settings.js";

describe("typed settings", () => {
  it("returns deterministic validated defaults", () => {
    expect(getSettingDefault("feed.pageSize")).toBe(40);
    expect(getSettingDefault("cache.policy")).toBe("NONE");
    expect(getSettingDefault("history.enabled")).toBe(true);
  });

  it("rejects unknown shapes and out-of-bound values", () => {
    expect(() => validateSetting("feed.pageSize", 0)).toThrow();
    expect(() => validateSetting("feed.pageSize", 101)).toThrow();
    expect(() => validateSetting("cache.policy", "FOREVER")).toThrow();
    expect(() => validateSetting("history.enabled", "true")).toThrow();
  });
});
