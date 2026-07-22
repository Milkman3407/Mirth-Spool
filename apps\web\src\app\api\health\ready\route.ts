import { checkRequiredDependencies } from "../../../../lib/dependencies";
import {
  createRequestId,
  evaluateReadiness,
  jsonHealthResponse,
} from "../../../../lib/health-response";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = createRequestId();
  const evaluation = evaluateReadiness(
    await checkRequiredDependencies(),
    requestId,
    new Date(),
  );
  return jsonHealthResponse(evaluation.body, evaluation.httpStatus);
}
