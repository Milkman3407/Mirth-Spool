import { z } from "zod";

import { apiError, apiJson } from "../../../../../lib/api-response";
import { requireAdminApiSession } from "../../../../../lib/auth/api-session";
import { revokeInvitation } from "../../../../../lib/auth/invitation-service";
import { consumeRateLimit } from "../../../../../lib/auth/rate-limit";
import { isSameOriginJsonMutation } from "../../../../../lib/auth/request-security";
import { getAuthServices } from "../../../../../lib/auth/server";

export async function DELETE(
  request: Request,
  context: { readonly params: Promise<{ readonly invitationId: string }> },
): Promise<Response> {
  const services = getAuthServices();
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  if (!isSameOriginJsonMutation(request, services.authConfig.publicOrigin)) {
    return apiError("CSRF_REJECTED", "The request could not be verified.", {
      requestId: authentication.requestId,
      status: 403,
    });
  }
  const limit = await consumeRateLimit(services.authenticationRateLimitStore, {
    key: `admin-invitation:${authentication.session.user.id}`,
    limit: 30,
    windowSeconds: 3_600,
  });
  if (!limit.allowed) {
    return apiError(
      "AUTH_RATE_LIMITED",
      "Too many invitation changes. Try again later.",
      {
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
        requestId: authentication.requestId,
        status: 429,
      },
    );
  }
  const id = z.uuid().safeParse((await context.params).invitationId);
  if (!id.success) {
    return apiError("VALIDATION_FAILED", "The invitation is invalid.", {
      requestId: authentication.requestId,
      status: 400,
    });
  }
  const revoked = await revokeInvitation(
    services.database,
    id.data,
    authentication.session.user.id,
  );
  return revoked
    ? apiJson({ revoked: true }, { requestId: authentication.requestId })
    : apiError("INVITATION_NOT_FOUND", "The invitation was not found.", {
        requestId: authentication.requestId,
        status: 404,
      });
}
