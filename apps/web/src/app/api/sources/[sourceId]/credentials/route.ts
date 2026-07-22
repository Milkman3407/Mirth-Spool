import { apiError, apiJson } from "../../../../../lib/api-response";
import { requireAdminApiSession } from "../../../../../lib/auth/api-session";
import {
  credentialInputSchema,
  sourceIdSchema,
} from "../../../../../lib/sources/schemas";
import {
  parseSourceRequest,
  sourceApiFailure,
} from "../../../../../lib/sources/source-api";
import { rotateSourceCredential } from "../../../../../lib/sources/source-service";
import { getSourceServices } from "../../../../../lib/sources/server";

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly sourceId: string }> },
): Promise<Response> {
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  const id = sourceIdSchema.safeParse((await context.params).sourceId);
  if (!id.success) {
    return apiError("VALIDATION_FAILED", "The source identifier is invalid.", {
      requestId: authentication.requestId,
      status: 400,
    });
  }
  const parsed = await parseSourceRequest(
    request,
    authentication.requestId,
    credentialInputSchema,
  );
  if ("response" in parsed) return parsed.response;
  try {
    const credential = await rotateSourceCredential(
      getSourceServices().dependencies,
      authentication.session.user.id,
      id.data,
      parsed.value,
    );
    return apiJson(
      { credential },
      { requestId: authentication.requestId, status: 201 },
    );
  } catch (error) {
    return sourceApiFailure(error, authentication.requestId);
  }
}
