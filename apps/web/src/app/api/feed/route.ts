import console from "node:console";

import { apiError, apiJson } from "../../../lib/api-response";
import { requireApiSession } from "../../../lib/auth/api-session";
import { readFeed } from "../../../lib/feed/feed-service";
import { getFeedServices } from "../../../lib/feed/server";

export async function GET(request: Request): Promise<Response> {
  const authentication = await requireApiSession(request);
  if ("response" in authentication) return authentication.response;
  const startedAt = performance.now();
  try {
    const page = await readFeed(
      getFeedServices(),
      authentication.session.user.id,
      request.url,
    );
    console.log(
      JSON.stringify({
        event: "feed.query",
        latencyMs: Math.round(performance.now() - startedAt),
        requestId: authentication.requestId,
      }),
    );
    return apiJson(page, { requestId: authentication.requestId });
  } catch (error) {
    const invalidCursor =
      error instanceof Error && error.message === "INVALID_CURSOR";
    console.log(
      JSON.stringify({
        event: "feed.query",
        latencyMs: Math.round(performance.now() - startedAt),
        outcome: "rejected",
        requestId: authentication.requestId,
      }),
    );
    return apiError(
      invalidCursor ? "INVALID_CURSOR" : "VALIDATION_FAILED",
      invalidCursor
        ? "The feed cursor is invalid or incompatible with this query."
        : "The feed query is invalid.",
      {
        requestId: authentication.requestId,
        status: 400,
      },
    );
  }
}
