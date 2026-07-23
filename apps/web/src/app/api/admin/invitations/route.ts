import { z } from "zod";

import { apiError, apiJson } from "../../../../lib/api-response";
import { requireAdminApiSession } from "../../../../lib/auth/api-session";
import {
  createInvitation,
  InvitationConflictError,
  listInvitations,
} from "../../../../lib/auth/invitation-service";
import { consumeRateLimit } from "../../../../lib/auth/rate-limit";
import { isSameOriginJsonMutation } from "../../../../lib/auth/request-security";
import { getAuthServices } from "../../../../lib/auth/server";
import { readBoundedJson } from "../../../../lib/bounded-json";

const bodySchema = z
  .object({
    email: z.email().max(320),
    expiresInHours: z.number().int().min(1).max(720).default(168),
  })
  .strict();

export async function GET(request: Request): Promise<Response> {
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  const items = await listInvitations(getAuthServices().database);
  return apiJson(
    {
      items: items.map((item) => ({
        ...item,
        acceptedAt: item.acceptedAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        expiresAt: item.expiresAt.toISOString(),
        revokedAt: item.revokedAt?.toISOString() ?? null,
      })),
    },
    { requestId: authentication.requestId },
  );
}

export async function POST(request: Request): Promise<Response> {
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
  const bounded = await readBoundedJson(request, {
    maxBytes: 1_024,
    requestId: authentication.requestId,
  });
  if ("response" in bounded) return bounded.response;
  const body = bodySchema.safeParse(bounded.value);
  if (!body.success) {
    return apiError("VALIDATION_FAILED", "The invitation is invalid.", {
      requestId: authentication.requestId,
      status: 400,
    });
  }
  try {
    const invitation = await createInvitation(services.database, body.data, {
      actorUserId: authentication.session.user.id,
      now: new Date(),
      secret: services.authConfig.secret,
    });
    return apiJson(
      {
        invitation: {
          createdAt: invitation.createdAt.toISOString(),
          email: invitation.email,
          expiresAt: invitation.expiresAt.toISOString(),
          id: invitation.id,
          token: invitation.token,
        },
      },
      { requestId: authentication.requestId, status: 201 },
    );
  } catch (error) {
    if (error instanceof InvitationConflictError) {
      return apiError("INVITATION_CONFLICT", "That account already exists.", {
        requestId: authentication.requestId,
        status: 409,
      });
    }
    return apiError(
      "INVITATION_UNAVAILABLE",
      "The invitation could not be created.",
      { requestId: authentication.requestId, status: 503 },
    );
  }
}
