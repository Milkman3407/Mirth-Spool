import "server-only";

import { BoundedMetrics } from "../../../../packages/shared/dist/index";

const registry = new BoundedMetrics(100);
const started = new Map<string, number>();

export function beginHttpRequest(requestId: string): void {
  if (started.size >= 2_000) started.delete(started.keys().next().value ?? "");
  started.set(requestId, performance.now());
}

export function finishHttpRequest(requestId: string, status: number): void {
  const start = started.get(requestId);
  started.delete(requestId);
  const statusClass = `${Math.floor(status / 100)}xx`;
  registry.increment("http_requests_total", { status: statusClass });
  const milliseconds =
    start === undefined ? 0 : Math.max(0, performance.now() - start);
  const bucket =
    milliseconds < 100
      ? "lt100ms"
      : milliseconds < 500
        ? "lt500ms"
        : milliseconds < 2_000
          ? "lt2s"
          : "gte2s";
  registry.increment("http_latency_total", { bucket, status: statusClass });
}

export function webMetrics(): BoundedMetrics {
  return registry;
}
