import { describe, expect, it } from "vitest";

import { evaluatePasswordPolicy, normalizeEmail } from "./password-policy";

describe("password policy", () => {
  it("accepts a long password unrelated to account identity", () => {
    expect(
      evaluatePasswordPolicy({
        email: "admin@example.invalid",
        name: "Mirth Owner",
        password: "Lemon-River-Quartz-47",
      }),
    ).toEqual({ codes: [], valid: true });
  });

  it("rejects short, common, and identity-derived passwords", () => {
    expect(
      evaluatePasswordPolicy({
        email: "administrator@example.invalid",
        name: "Mirth Owner",
        password: "administrator",
      }),
    ).toMatchObject({
      codes: expect.arrayContaining([
        "PASSWORD_TOO_SHORT",
        "PASSWORD_CONTAINS_IDENTITY",
      ]),
      valid: false,
    });
    expect(
      evaluatePasswordPolicy({
        email: "admin@example.invalid",
        name: "Owner",
        password: "passwordpassword",
      }).codes,
    ).toContain("PASSWORD_COMMON");
  });

  it("normalizes email identifiers consistently", () => {
    expect(normalizeEmail("  Admin@Example.INVALID ")).toBe(
      "admin@example.invalid",
    );
  });
});
