export interface DependencyHealth {
  readonly code: "DEPENDENCY_UNAVAILABLE" | "DEPENDENCY_TIMEOUT" | null;
  readonly ready: boolean;
}

export type HealthStatus = "live" | "not_ready" | "ready";

export interface HealthPayload {
  readonly requestId: string;
  readonly service: "web";
  readonly status: HealthStatus;
  readonly timestamp: string;
}

export interface ReadinessEvaluation {
  readonly body: HealthPayload;
  readonly httpStatus: 200 | 503;
}

export function createHealthPayload(
  status: HealthStatus,
  requestId: string,
  now: Date,
): HealthPayload {
  return Object.freeze({
    requestId,
    service: "web",
    status,
    timestamp: now.toISOString(),
  });
}

export function evaluateReadiness(
  dependencies: readonly DependencyHealth[],
  requestId: string,
  now: Date,
): ReadinessEvaluation {
  const ready = dependencies.every((dependency) => dependency.ready);

  return Object.freeze({
    body: createHealthPayload(ready ? "ready" : "not_ready", requestId, now),
    httpStatus: ready ? 200 : 503,
  });
}
