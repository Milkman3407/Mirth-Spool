import { randomUUID } from "node:crypto";

import {
  createHealthPayload,
  evaluateReadiness,
  type HealthPayload,
} from "../../../../packages/shared/dist/index.js";

export { createHealthPayload, evaluateReadiness };

export function createRequestId(): string {
  return `req_${randomUUID().replaceAll("-", "")}`;
}

export function jsonHealthResponse(
  body: HealthPayload,
  status: 200 | 503,
): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Request-Id": body.requestId,
    },
  });
}
