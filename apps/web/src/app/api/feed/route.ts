import { apiError } from "../../../lib/api-response";
import { requireApiSession } from "../../../lib/auth/api-session";

export async function GET(request: Request): Promise<Response> {
  const authentication = await requireApiSession(request);
  if ("response" in authentication) return authentication.response;
  return apiError(
    "FEATURE_NOT_AVAILABLE",
    "The feed is introduced in a later milestone.",
    {
      requestId: authentication.requestId,
      status: 501,
    },
  );
}
