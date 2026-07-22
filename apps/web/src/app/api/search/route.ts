import console from "node:console";

import { apiError, apiJson } from "../../../lib/api-response";
import { requireApiSession } from "../../../lib/auth/api-session";
import { enforceSearchRateLimit } from "../../../lib/search/search-api";
import { readSearch } from "../../../lib/search/search-service";
import { getSearchServices } from "../../../lib/search/server";

export async function GET(request: Request): Promise<Response> {
  const authentication = await requireApiSession(request);
  if ("response" in authentication) return authentication.response;
  const rateLimited = await enforceSearchRateLimit(
    authentication.session.user.id,
    authentication.requestId,
  );
  if (rateLimited) return rateLimited;
  const startedAt = performance.now();
  try {
    const page = await readSearch(
      getSearchServices(),
      authentication.session.user.id,
      request.url,
      { allowHidden: authentication.session.user.role === "ADMIN" },
    );
    console.log(
      JSON.stringify({
        event: "search.query",
        latencyMs: Math.round(performance.now() - startedAt),
        requestId: authentication.requestId,
      }),
    );
    return apiJson(page, { requestId: authentication.requestId });
  } catch (error) {
    const invalidCursor =
      error instanceof Error && error.message === "INVALID_CURSOR";
    const forbidden =
      error instanceof Error && error.message === "FORBIDDEN_FILTER";
    return apiError(
      forbidden
        ? "AUTHORIZATION_REQUIRED"
        : invalidCursor
          ? "INVALID_CURSOR"
          : "VALIDATION_FAILED",
      forbidden
        ? "Administrator access is required for hidden-content search."
        : invalidCursor
          ? "The search cursor is invalid or incompatible with this query."
          : "The search query or filters are invalid.",
      {
        requestId: authentication.requestId,
        status: forbidden ? 403 : 400,
      },
    );
  }
}
