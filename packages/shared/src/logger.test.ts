import { describe, expect, it } from "vitest";

import { createStructuredLogger } from "./logger.js";

describe("structured logger", () => {
  it("emits deterministic JSON with service and environment context", () => {
    const lines: string[] = [];
    const logger = createStructuredLogger({
      environment: "test",
      minimumLevel: "info",
      now: () => new Date("2026-01-02T03:04:05.000Z"),
      service: "worker",
      sink: (line) => lines.push(line),
    });

    logger.debug("hidden");
    logger.info("worker.ready", { dependencies: 2 });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      dependencies: 2,
      environment: "test",
      event: "worker.ready",
      level: "info",
      service: "worker",
      timestamp: "2026-01-02T03:04:05.000Z",
    });
  });

  it("redacts synthetic passwords, tokens, cookies, and URL query values", () => {
    const lines: string[] = [];
    const logger = createStructuredLogger({
      environment: "test",
      minimumLevel: "debug",
      service: "web",
      sink: (line) => lines.push(line),
    });
    logger.error("redaction_test", {
      authorization: "Bearer canary-token",
      cookie: "session=canary-cookie",
      nested: { password: "canary-password" },
      target: "https://user:pass@example.invalid/path?token=canary-query#frag",
    });
    expect(lines[0]).not.toContain("canary");
    expect(lines[0]).toContain("[REDACTED]");
    expect(lines[0]).toContain("https://example.invalid/path");
  });
});
