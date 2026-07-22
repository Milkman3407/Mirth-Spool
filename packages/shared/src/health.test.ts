import { describe, expect, it } from "vitest";

import { createHealthPayload, evaluateReadiness } from "./health.js";

const now = new Date("2026-01-02T03:04:05.000Z");

describe("health status mapping", () => {
  it("maps liveness without consulting dependencies", () => {
    expect(createHealthPayload("live", "req_live", now)).toEqual({
      requestId: "req_live",
      service: "web",
      status: "live",
      timestamp: "2026-01-02T03:04:05.000Z",
    });
  });

  it("returns ready only when every required dependency is ready", () => {
    expect(
      evaluateReadiness(
        [
          { code: null, ready: true },
          { code: null, ready: true },
        ],
        "req_ready",
        now,
      ),
    ).toEqual({
      body: {
        requestId: "req_ready",
        service: "web",
        status: "ready",
        timestamp: "2026-01-02T03:04:05.000Z",
      },
      httpStatus: 200,
    });
  });

  it("returns a sanitized non-ready response for dependency failures", () => {
    const evaluation = evaluateReadiness(
      [
        { code: null, ready: true },
        { code: "DEPENDENCY_UNAVAILABLE", ready: false },
      ],
      "req_not_ready",
      now,
    );

    expect(evaluation.httpStatus).toBe(503);
    expect(evaluation.body).toEqual({
      requestId: "req_not_ready",
      service: "web",
      status: "not_ready",
      timestamp: "2026-01-02T03:04:05.000Z",
    });
    expect(JSON.stringify(evaluation.body)).not.toContain(
      "DEPENDENCY_UNAVAILABLE",
    );
  });
});
