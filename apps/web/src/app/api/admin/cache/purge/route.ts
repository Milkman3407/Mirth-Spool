import { apiError, apiJson } from "../../../../../lib/api-response";
import { requireAdminApiSession } from "../../../../../lib/auth/api-session";
import { isSameOriginJsonMutation } from "../../../../../lib/auth/request-security";
import { getAuthServices } from "../../../../../lib/auth/server";
import { readBoundedJson } from "../../../../../lib/bounded-json";
import { enforceCacheMutationRateLimit } from "../../../../../lib/cache/cache-api";
import { enqueueCacheMaintenance } from "../../../../../lib/cache/cache-service";
import { cachePurgeSchema } from "../../../../../lib/cache/schemas";
import { getCacheServices } from "../../../../../lib/cache/server";

export async function POST(request: Request): Promise<Response> {
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  if (
    !isSameOriginJsonMutation(
      request,
      getAuthServices().authConfig.publicOrigin,
    )
  ) {
    return apiError("CSRF_REJECTED", "The request could not be verified.", {
      requestId: authentication.requestId,
      status: 403,
    });
  }
  const limited = await enforceCacheMutationRateLimit(
    authentication.session.user.id,
    authentication.requestId,
  );
  if (limited) return limited;
  const bounded = await readBoundedJson(request, {
    maxBytes: 128,
    requestId: authentication.requestId,
  });
  if ("response" in bounded) return bounded.response;
  if (!cachePurgeSchema.safeParse(bounded.value).success) {
    return apiError(
      "CACHE_PURGE_CONFIRMATION_REQUIRED",
      "Type PURGE CACHE to confirm removal of cached bytes.",
      { requestId: authentication.requestId, status: 400 },
    );
  }
  try {
    const job = await enqueueCacheMaintenance(
      getCacheServices(),
      authentication.session.user.id,
      "PURGE",
      new Date(),
    );
    return apiJson(
      { job },
      { requestId: authentication.requestId, status: 202 },
    );
  } catch {
    return apiError("CACHE_UNAVAILABLE", "Cache purge could not be queued.", {
      requestId: authentication.requestId,
      status: 503,
    });
  }
}
