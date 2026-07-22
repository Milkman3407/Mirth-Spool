import { z } from "zod";

import { apiError } from "../../../../lib/api-response";
import { requireApiSession } from "../../../../lib/auth/api-session";
import {
  consumeRateLimit,
  hashRateLimitSubject,
} from "../../../../lib/auth/rate-limit";
import { getAuthServices } from "../../../../lib/auth/server";
import { openCachedMedia } from "../../../../lib/cache/cache-service";
import { getCacheServices } from "../../../../lib/cache/server";

type Context = { readonly params: Promise<{ readonly mediaId: string }> };

export function GET(request: Request, context: Context) {
  return serve(request, context, "GET");
}

export function HEAD(request: Request, context: Context) {
  return serve(request, context, "HEAD");
}

async function serve(
  request: Request,
  context: Context,
  method: "GET" | "HEAD",
): Promise<Response> {
  const authentication = await requireApiSession(request);
  if ("response" in authentication) return authentication.response;
  const mediaId = z.uuid().safeParse((await context.params).mediaId);
  if (!mediaId.success || new URL(request.url).search !== "") {
    return apiError("VALIDATION_FAILED", "The media request is invalid.", {
      requestId: authentication.requestId,
      status: 400,
    });
  }
  const services = getCacheServices();
  try {
    const subject = hashRateLimitSubject(
      getAuthServices().authConfig.secret,
      "media-serving",
      authentication.session.user.id,
    );
    const decision = await consumeRateLimit(services.servingRateLimitStore, {
      key: subject,
      limit: 300,
      windowSeconds: 60,
    });
    if (!decision.allowed) {
      return apiError("MEDIA_RATE_LIMITED", "Too many media requests.", {
        headers: { "Retry-After": String(decision.retryAfterSeconds) },
        requestId: authentication.requestId,
        status: 429,
      });
    }
    const response = await openCachedMedia(services, {
      ifNoneMatch: request.headers.get("if-none-match"),
      mediaId: mediaId.data,
      method,
      now: new Date(),
      range: request.headers.get("range"),
    });
    return (
      response ??
      apiError("MEDIA_NOT_FOUND", "The cached media was not found.", {
        requestId: authentication.requestId,
        status: 404,
      })
    );
  } catch {
    return apiError(
      "MEDIA_UNAVAILABLE",
      "The cached media is temporarily unavailable.",
      { requestId: authentication.requestId, status: 503 },
    );
  }
}
