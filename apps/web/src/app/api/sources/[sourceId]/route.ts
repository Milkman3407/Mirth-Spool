import { apiError, apiJson } from "../../../../lib/api-response";
import { requireAdminApiSession } from "../../../../lib/auth/api-session";
import {
  sourceIdSchema,
  updateSourceSchema,
} from "../../../../lib/sources/schemas";
import {
  parseSourceRequest,
  sourceApiFailure,
} from "../../../../lib/sources/source-api";
import {
  readManagedSource,
  softDeleteManagedSource,
  updateManagedSource,
} from "../../../../lib/sources/source-service";
import { getSourceServices } from "../../../../lib/sources/server";

async function sourceId(
  context: { readonly params: Promise<{ readonly sourceId: string }> },
  requestId: string,
): Promise<{ readonly id: string } | { readonly response: Response }> {
  const parsed = sourceIdSchema.safeParse((await context.params).sourceId);
  return parsed.success
    ? { id: parsed.data }
    : {
        response: apiError(
          "VALIDATION_FAILED",
          "The source identifier is invalid.",
          {
            requestId,
            status: 400,
          },
        ),
      };
}

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly sourceId: string }> },
): Promise<Response> {
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  const parsedId = await sourceId(context, authentication.requestId);
  if ("response" in parsedId) return parsedId.response;
  try {
    const source = await readManagedSource(
      getSourceServices().dependencies,
      parsedId.id,
    );
    return apiJson({ source }, { requestId: authentication.requestId });
  } catch (error) {
    return sourceApiFailure(error, authentication.requestId);
  }
}

export async function PATCH(
  request: Request,
  context: { readonly params: Promise<{ readonly sourceId: string }> },
): Promise<Response> {
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  const parsedId = await sourceId(context, authentication.requestId);
  if ("response" in parsedId) return parsedId.response;
  const parsed = await parseSourceRequest(
    request,
    authentication.requestId,
    updateSourceSchema,
  );
  if ("response" in parsed) return parsed.response;
  try {
    const source = await updateManagedSource(
      getSourceServices().dependencies,
      authentication.session.user.id,
      parsedId.id,
      parsed.value,
    );
    return apiJson({ source }, { requestId: authentication.requestId });
  } catch (error) {
    return sourceApiFailure(error, authentication.requestId);
  }
}

export async function DELETE(
  request: Request,
  context: { readonly params: Promise<{ readonly sourceId: string }> },
): Promise<Response> {
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  const parsedId = await sourceId(context, authentication.requestId);
  if ("response" in parsedId) return parsedId.response;
  const parsed = await parseSourceRequest(
    request,
    authentication.requestId,
    z.object({}).strict(),
  );
  if ("response" in parsed) return parsed.response;
  try {
    const result = await softDeleteManagedSource(
      getSourceServices().dependencies,
      authentication.session.user.id,
      parsedId.id,
    );
    return apiJson(result, { requestId: authentication.requestId });
  } catch (error) {
    return sourceApiFailure(error, authentication.requestId);
  }
}
import { z } from "zod";
