import { apiError, apiJson } from "../../../../lib/api-response";
import { requireAdminApiSession } from "../../../../lib/auth/api-session";
import { isSameOriginJsonMutation } from "../../../../lib/auth/request-security";
import { getAuthServices } from "../../../../lib/auth/server";
import { readBoundedJson } from "../../../../lib/bounded-json";
import { enforceCacheMutationRateLimit } from "../../../../lib/cache/cache-api";
import {
  readCacheAdministration,
  updateCacheSettings,
} from "../../../../lib/cache/cache-service";
import { cacheSettingsSchema } from "../../../../lib/cache/schemas";
import { getCacheServices } from "../../../../lib/cache/server";

export async function GET(request: Request): Promise<Response> {
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  try {
    const cache = await readCacheAdministration(getCacheServices());
    return apiJson({ cache }, { requestId: authentication.requestId });
  } catch {
    return apiError("CACHE_UNAVAILABLE", "Cache status is unavailable.", {
      requestId: authentication.requestId,
      status: 503,
    });
  }
}

export async function PATCH(request: Request): Promise<Response> {
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
  const rateLimited = await enforceCacheMutationRateLimit(
    authentication.session.user.id,
    authentication.requestId,
  );
  if (rateLimited) return rateLimited;
  const bounded = await readBoundedJson(request, {
    maxBytes: 2_048,
    requestId: authentication.requestId,
  });
  if ("response" in bounded) return bounded.response;
  const body = cacheSettingsSchema.safeParse(bounded.value);
  if (!body.success) {
    return apiError("VALIDATION_FAILED", "The cache settings are invalid.", {
      requestId: authentication.requestId,
      status: 400,
    });
  }
  try {
    await updateCacheSettings(
      getCacheServices().database,
      authentication.session.user.id,
      body.data,
    );
    const cache = await readCacheAdministration(getCacheServices());
    return apiJson({ cache }, { requestId: authentication.requestId });
  } catch {
    return apiError("CACHE_UNAVAILABLE", "Cache settings could not be saved.", {
      requestId: authentication.requestId,
      status: 503,
    });
  }
}
