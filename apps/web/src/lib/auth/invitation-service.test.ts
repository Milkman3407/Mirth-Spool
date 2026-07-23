import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hashInvitationToken } from "./invitation-service";

describe("invitation token hashing", () => {
  it("is stable, secret-bound, and does not retain plaintext", () => {
    const token = "A".repeat(43);
    const digest = hashInvitationToken("first-secret", token);
    expect(digest).toHaveLength(43);
    expect(digest).not.toContain(token);
    expect(digest).toBe(hashInvitationToken("first-secret", token));
    expect(digest).not.toBe(hashInvitationToken("second-secret", token));
  });

  it("rejects malformed or undersized tokens before hashing", () => {
    expect(() => hashInvitationToken("secret", "short")).toThrow();
    expect(() => hashInvitationToken("secret", `${"A".repeat(42)}!`)).toThrow();
  });
});
