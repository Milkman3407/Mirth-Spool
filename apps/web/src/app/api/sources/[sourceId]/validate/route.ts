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
import { validateManagedSource } from "../../../../../lib/sources/source-service";

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
  const sourceServices = getSourceServices();
  try {
    const authConfig = getAuthServices().authConfig;
    const subject = hashRateLimitSubject(
      authConfig.secret,
      "source-validation",
      `${authentication.session.user.id}:${id.data}`,
    );
    const decision = await consumeRateLimit(
      sourceServices.validationRateLimitStore,
      {
        key: subject,
        limit: 5,
        windowSeconds: 300,
      },
    );
    if (!decision.allowed) {
      return apiError(
        "SOURCE_VALIDATION_RATE_LIMITED",
        "Too many source validation attempts. Try again later.",
        {
          headers: { "Retry-After": String(decision.retryAfterSeconds) },
          requestId: authentication.requestId,
          status: 429,
        },
      );
    }
    const result = await validateManagedSource(
      sourceServices.dependencies,
      authentication.session.user.id,
      id.data,
      request.signal,
    );
    return apiJson({ result }, { requestId: authentication.requestId });
  } catch (error) {
    sourceServices.dependencies.logger.error("source validation route failed", {
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
