import { describe, expect, it } from "vitest";

import { mapAuthenticationError } from "./authentication-error";

describe("safe authentication error mapping", () => {
  it("maps client and server failures without provider details", () => {
    expect(mapAuthenticationError(401)).toEqual({
      code: "AUTHENTICATION_FAILED",
      message: "The supplied credentials were not accepted.",
      status: 401,
    });
    expect(JSON.stringify(mapAuthenticationError(500))).not.toContain(
      "password",
    );
    expect(mapAuthenticationError(500).status).toBe(503);
  });
});
