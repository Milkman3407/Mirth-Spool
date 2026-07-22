import { z } from "zod";

import { apiError, apiJson } from "../../../../lib/api-response";
import { requireAdminApiSession } from "../../../../lib/auth/api-session";
import { readDuplicateAdministration } from "../../../../lib/duplicates/duplicate-service";
import { getDuplicateServices } from "../../../../lib/duplicates/server";

export async function GET(request: Request): Promise<Response> {
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  const url = new URL(request.url);
  if (
    [...url.searchParams.keys()].some(
      (key) => !["cursor", "limit"].includes(key),
    )
  ) {
    return invalid(authentication.requestId);
  }
  const parsed = z
    .object({
      cursor: z.uuid().optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    })
    .safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
  if (!parsed.success) return invalid(authentication.requestId);
  const duplicates = await readDuplicateAdministration(
    getDuplicateServices().database,
    {
      ...(parsed.data.cursor ? { cursor: parsed.data.cursor } : {}),
      limit: parsed.data.limit,
    },
  );
  return apiJson(duplicates, { requestId: authentication.requestId });
}

function invalid(requestId: string) {
  return apiError(
    "VALIDATION_FAILED",
    "The duplicate-group query is invalid.",
    { requestId, status: 400 },
  );
}
