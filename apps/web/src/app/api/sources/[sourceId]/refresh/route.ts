import { z } from "zod";

import { apiError, apiJson } from "../../../../../lib/api-response";
import { requireAdminApiSession } from "../../../../../lib/auth/api-session";
import {
  consumeRateLimit,
  hashRateLimitSubject,
} from "../../../../../lib/auth/rate-limit";
import { getAuthServices } from "../../../../../lib/auth/server";
import { sourceIdSchema } from "../../../../../lib/sources/schemas";
import {
  parseSourceRequest,
  sourceApiFailure,
} from "../../../../../lib/sources/source-api";
import { getSourceServices } from "../../../../../lib/sources/server";
import { enqueueManualSourceRefresh } from "../../../../../lib/sources/source-service";

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
  const services = getSourceServices();
  try {
    const subject = hashRateLimitSubject(
      getAuthServices().authConfig.secret,
      "source-refresh",
      `${authentication.session.user.id}:${id.data}`,
    );
    const decision = await consumeRateLimit(services.refreshRateLimitStore, {
      key: subject,
      limit: 5,
      windowSeconds: 60,
    });
    if (!decision.allowed) {
      return apiError(
        "SOURCE_REFRESH_RATE_LIMITED",
        "Too many refresh requests. Try again later.",
        {
          headers: { "Retry-After": String(decision.retryAfterSeconds) },
          requestId: authentication.requestId,
          status: 429,
        },
      );
    }
    const job = await enqueueManualSourceRefresh(
      services.dependencies,
      services.sourcePollQueue,
      authentication.session.user.id,
      id.data,
      authentication.requestId,
    );
    return apiJson(
      { job },
      { requestId: authentication.requestId, status: 202 },
    );
  } catch (error) {
    services.dependencies.logger.error("source refresh route failed", {
      errorCode:
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : undefined,
      errorType: error instanceof Error ? error.name : typeof error,
      requestId: authentication.requestId,
    });
    return sourceApiFailure(error, authentication.requestId);
  }
}
