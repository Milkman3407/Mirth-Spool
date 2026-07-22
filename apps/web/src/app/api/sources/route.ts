import { apiJson } from "../../../lib/api-response";
import { requireAdminApiSession } from "../../../lib/auth/api-session";
import { createSourceSchema } from "../../../lib/sources/schemas";
import {
  parseSourceRequest,
  sourceApiFailure,
} from "../../../lib/sources/source-api";
import {
  createManagedSource,
  listManagedSources,
} from "../../../lib/sources/source-service";
import { getSourceServices } from "../../../lib/sources/server";

export async function GET(request: Request): Promise<Response> {
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  try {
    const items = await listManagedSources(getSourceServices().dependencies);
    return apiJson({ items }, { requestId: authentication.requestId });
  } catch (error) {
    return sourceApiFailure(error, authentication.requestId);
  }
}

export async function POST(request: Request): Promise<Response> {
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  const parsed = await parseSourceRequest(
    request,
    authentication.requestId,
    createSourceSchema,
  );
  if ("response" in parsed) return parsed.response;
  try {
    const source = await createManagedSource(
      getSourceServices().dependencies,
      authentication.session.user.id,
      parsed.value,
    );
    return apiJson(
      { source },
      { requestId: authentication.requestId, status: 201 },
    );
  } catch (error) {
    return sourceApiFailure(error, authentication.requestId);
  }
}
