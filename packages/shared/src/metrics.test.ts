import { describe, expect, it } from "vitest";

import { BoundedMetrics } from "./metrics.js";

describe("BoundedMetrics", () => {
  it("counts only bounded, low-cardinality series", () => {
    const metrics = new BoundedMetrics(1);
    metrics.increment("jobs_total", { outcome: "success", queue: "source" });
    metrics.increment("jobs_total", { outcome: "success", queue: "source" }, 2);
    metrics.increment("jobs_total", { outcome: "failed", queue: "source" });
    expect(metrics.toPrometheus()).toBe(
      'mirthspool_jobs_total{outcome="success",queue="source"} 3\n',
    );
  });

  it("rejects labels that could contain user-controlled data", () => {
    const metrics = new BoundedMetrics();
    expect(() =>
      metrics.increment("requests_total", { url: "https://private.invalid/a" }),
    ).toThrow();
  });
});
