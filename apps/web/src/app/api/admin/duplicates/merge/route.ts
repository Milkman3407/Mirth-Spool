import { apiError, apiJson } from "../../../../../lib/api-response";
import { requireAdminApiSession } from "../../../../../lib/auth/api-session";
import { isSameOriginJsonMutation } from "../../../../../lib/auth/request-security";
import { getAuthServices } from "../../../../../lib/auth/server";
import { readBoundedJson } from "../../../../../lib/bounded-json";
import { enforceDuplicateMutationRateLimit } from "../../../../../lib/duplicates/duplicate-api";
import { manuallyMergeDuplicates } from "../../../../../lib/duplicates/duplicate-service";
import { duplicateMergeSchema } from "../../../../../lib/duplicates/schemas";
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
    maxBytes: 1_024,
    requestId: authentication.requestId,
  });
  if ("response" in bounded) return bounded.response;
  const body = duplicateMergeSchema.safeParse(bounded.value);
  if (!body.success) return invalid(authentication.requestId);
  try {
    const result = await manuallyMergeDuplicates(
      getDuplicateServices().database,
      authentication.session.user.id,
      body.data,
    );
    return apiJson({ result }, { requestId: authentication.requestId });
  } catch {
    return apiError(
      "DUPLICATE_MERGE_FAILED",
      "The items could not be merged.",
      {
        requestId: authentication.requestId,
        status: 409,
      },
    );
  }
}

function invalid(requestId: string) {
  return apiError("VALIDATION_FAILED", "The merge request is invalid.", {
    requestId,
    status: 400,
  });
}
