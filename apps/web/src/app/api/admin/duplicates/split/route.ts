import { apiError, apiJson } from "../../../../../lib/api-response";
import { requireAdminApiSession } from "../../../../../lib/auth/api-session";
import { isSameOriginJsonMutation } from "../../../../../lib/auth/request-security";
import { getAuthServices } from "../../../../../lib/auth/server";
import { readBoundedJson } from "../../../../../lib/bounded-json";
import { enforceDuplicateMutationRateLimit } from "../../../../../lib/duplicates/duplicate-api";
import { manuallySplitDuplicate } from "../../../../../lib/duplicates/duplicate-service";
import { duplicateSplitSchema } from "../../../../../lib/duplicates/schemas";
import { getDuplicateServices } from "../../../../../lib/duplicates/server";

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
  const rateLimited = await enforceDuplicateMutationRateLimit(
    authentication.session.user.id,
    authentication.requestId,
  );
  if (rateLimited) return rateLimited;
  const bounded = await readBoundedJson(request, {
    maxBytes: 512,
    requestId: authentication.requestId,
  });
  if ("response" in bounded) return bounded.response;
  const body = duplicateSplitSchema.safeParse(bounded.value);
  if (!body.success) return invalid(authentication.requestId);
  const result = await manuallySplitDuplicate(
    getDuplicateServices().database,
    authentication.session.user.id,
    body.data.contentId,
    new Date(),
  );
  return apiJson({ result }, { requestId: authentication.requestId });
}

function invalid(requestId: string) {
  return apiError("VALIDATION_FAILED", "The split request is invalid.", {
    requestId,
    status: 400,
  });
}
