import console from "node:console";
import { z } from "zod";

import { apiError, apiJson } from "../../../../lib/api-response";
import { requireApiSession } from "../../../../lib/auth/api-session";
import { readContent } from "../../../../lib/feed/feed-service";
import { getFeedServices } from "../../../../lib/feed/server";

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly contentId: string }> },
): Promise<Response> {
  const authentication = await requireApiSession(request);
  if ("response" in authentication) return authentication.response;
  const parsed = z.uuid().safeParse((await context.params).contentId);
  if (!parsed.success)
    return apiError("VALIDATION_FAILED", "The content identifier is invalid.", {
      requestId: authentication.requestId,
      status: 400,
    });
  const startedAt = performance.now();
  const content = await readContent(
    getFeedServices(),
    authentication.session.user.id,
    parsed.data,
  );
  console.log(
    JSON.stringify({
      event: "content.read",
      latencyMs: Math.round(performance.now() - startedAt),
      requestId: authentication.requestId,
    }),
  );
  return content
    ? apiJson({ content }, { requestId: authentication.requestId })
    : apiError("CONTENT_NOT_FOUND", "The content item was not found.", {
        requestId: authentication.requestId,
        status: 404,
      });
}
