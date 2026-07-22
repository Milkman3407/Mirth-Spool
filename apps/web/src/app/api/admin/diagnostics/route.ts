import { apiError, apiJson } from "../../../../lib/api-response";
import { requireAdminApiSession } from "../../../../lib/auth/api-session";
import { readOperationalSnapshot } from "../../../../lib/operations/server";

export async function GET(request: Request): Promise<Response> {
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  try {
    const diagnostics = await readOperationalSnapshot();
    return apiJson({ diagnostics }, { requestId: authentication.requestId });
  } catch {
    return apiError("DIAGNOSTICS_UNAVAILABLE", "Diagnostics are unavailable.", {
      requestId: authentication.requestId,
      status: 503,
    });
  }
}
