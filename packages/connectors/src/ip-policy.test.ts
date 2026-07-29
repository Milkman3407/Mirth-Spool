import { describe, expect, it } from "vitest";

import {
  assertAddressPolicy,
  isPublicAddress,
  validateOutboundUrl,
} from "./ip-policy.js";

describe("outbound IP policy", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.0.0.1",
    "192.0.2.1",
    "192.168.1.2",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "64:ff9b::7f00:1",
    "2002:7f00:1::",
    "100::1",
    "2001:db8::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
  ])("rejects non-public address %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    "1.1.1.1",
    "8.8.8.8",
    "2001:4860:4860::8888",
    "2606:4700:4700::1111",
  ])("accepts public address %s", (address) =>
    expect(isPublicAddress(address)).toBe(true),
  );

  it("rejects a mixed DNS answer unless every private result is allowlisted", () => {
    const answers = [
      { address: "1.1.1.1", family: 4 as const },
      { address: "127.0.0.1", family: 4 as const },
    ];
    expect(() => assertAddressPolicy(answers)).toThrow("disallowed");
    expect(
      assertAddressPolicy(answers, ["127.0.0.1"], "feeds.internal"),
    ).toEqual(answers[0]);
    expect(
      assertAddressPolicy(
        [{ address: "10.20.4.5", family: 4 }],
        ["10.20.0.0/16"],
        "feeds.internal",
      ),
    ).toEqual({ address: "10.20.4.5", family: 4 });
  });

  it("allows only HTTP(S), no embedded credentials, and reviewed ports", () => {
    expect(validateOutboundUrl("https://example.com/path").toString()).toBe(
      "https://example.com/path",
    );
    expect(() => validateOutboundUrl("file:///etc/passwd")).toThrow();
    expect(() =>
      validateOutboundUrl("https://user:secret@example.com/"),
    ).toThrow();
    expect(() => validateOutboundUrl("https://example.com/#private")).toThrow(
      "fragments",
    );
    expect(() => validateOutboundUrl("https://example.com:8443/")).toThrow();
    expect(
      validateOutboundUrl("https://example.com:8443/", [443, 8443]).port,
    ).toBe("8443");
  });
});
