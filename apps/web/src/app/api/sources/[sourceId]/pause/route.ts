import { z } from "zod";

import { apiError, apiJson } from "../../../../../lib/api-response";
import { requireAdminApiSession } from "../../../../../lib/auth/api-session";
import { sourceIdSchema } from "../../../../../lib/sources/schemas";
import {
  parseSourceRequest,
  sourceApiFailure,
} from "../../../../../lib/sources/source-api";
import { setSourcePaused } from "../../../../../lib/sources/source-service";
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
    z.object({}).strict(),
  );
  if ("response" in parsed) return parsed.response;
  try {
    const source = await setSourcePaused(
      getSourceServices().dependencies,
      authentication.session.user.id,
      id.data,
      true,
    );
    return apiJson({ source }, { requestId: authentication.requestId });
  } catch (error) {
    return sourceApiFailure(error, authentication.requestId);
  }
}
