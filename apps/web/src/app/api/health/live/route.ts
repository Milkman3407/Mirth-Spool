import {
  createHealthPayload,
  createRequestId,
  jsonHealthResponse,
} from "../../../../lib/health-response";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const requestId = createRequestId();
  return jsonHealthResponse(
    createHealthPayload("live", requestId, new Date()),
    200,
  );
}
