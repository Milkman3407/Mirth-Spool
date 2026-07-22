import { z } from "zod";

import { apiError, apiJson } from "../../../../../lib/api-response";
import { requireAdminApiSession } from "../../../../../lib/auth/api-session";
import { sourceIdSchema } from "../../../../../lib/sources/schemas";
import { sourceApiFailure } from "../../../../../lib/sources/source-api";
import { getSourceServices } from "../../../../../lib/sources/server";
import { listManagedSourceRuns } from "../../../../../lib/sources/source-service";

const querySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly sourceId: string }> },
): Promise<Response> {
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  const id = sourceIdSchema.safeParse((await context.params).sourceId);
  const url = new URL(request.url);
  const query = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!id.success || !query.success) {
    return apiError(
      "VALIDATION_FAILED",
      "The run history request is invalid.",
      {
        requestId: authentication.requestId,
        status: 400,
      },
    );
  }
  try {
    const result = await listManagedSourceRuns(
      getSourceServices().dependencies,
      id.data,
      {
        ...(query.data.cursor ? { cursor: query.data.cursor } : {}),
        limit: query.data.limit,
      },
    );
    return apiJson(result, { requestId: authentication.requestId });
  } catch (error) {
    getSourceServices().dependencies.logger.error(
      "source run history route failed",
      {
        errorCode:
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : undefined,
        errorType: error instanceof Error ? error.name : typeof error,
        requestId: authentication.requestId,
      },
    );
    return sourceApiFailure(error, authentication.requestId);
  }
}
