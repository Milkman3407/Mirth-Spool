import { z } from "zod";

import { apiError, apiJson, requestIdFrom } from "../../../../lib/api-response";
import {
  acceptInvitation,
  hashInvitationToken,
  InvitationUnavailableError,
} from "../../../../lib/auth/invitation-service";
import { evaluatePasswordPolicy } from "../../../../lib/auth/password-policy";
import { hashPassword } from "../../../../lib/auth/password";
import {
  consumeInvitationAcceptanceLimits,
  getClientAddress,
} from "../../../../lib/auth/rate-limit";
import { isSameOriginJsonMutation } from "../../../../lib/auth/request-security";
import { getAuthServices } from "../../../../lib/auth/server";
import { readBoundedJson } from "../../../../lib/bounded-json";

const bodySchema = z
  .object({
    email: z.email().max(320),
    name: z.string().trim().min(1).max(120),
    password: z.string().min(1).max(128),
    token: z
      .string()
      .min(43)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/u),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  const services = getAuthServices();
  const requestId = requestIdFrom(request);
  if (!isSameOriginJsonMutation(request, services.authConfig.publicOrigin)) {
    return apiError("CSRF_REJECTED", "The request could not be verified.", {
      requestId,
      status: 403,
    });
  }
  const bounded = await readBoundedJson(request, {
    maxBytes: 2_048,
    requestId,
  });
  if ("response" in bounded) return bounded.response;
  const body = bodySchema.safeParse(bounded.value);
  if (!body.success) {
    return apiError(
      "INVITATION_UNAVAILABLE",
      "The invitation could not be accepted.",
      { requestId, status: 400 },
    );
  }
  const address = getClientAddress(
    request.headers,
    services.authConfig.trustedProxyAddresses,
  );
  const tokenHash = hashInvitationToken(
    services.authConfig.secret,
    body.data.token,
  );
  const limit = await consumeInvitationAcceptanceLimits(
    services.authenticationRateLimitStore,
    {
      address,
      secret: services.authConfig.secret,
      tokenHash,
    },
  );
  if (!limit.allowed) {
    return apiError(
      "INVITATION_RATE_LIMITED",
      "Too many invitation attempts. Try again later.",
      {
        headers: {
          "Retry-After": String(limit.retryAfterSeconds),
        },
        requestId,
        status: 429,
      },
    );
  }
  const policy = evaluatePasswordPolicy({
    email: body.data.email,
    name: body.data.name,
    password: body.data.password,
  });
  if (!policy.valid) {
    return apiError("PASSWORD_POLICY_REJECTED", "Choose a stronger password.", {
      requestId,
      status: 400,
    });
  }
  try {
    const user = await acceptInvitation(services.database, {
      ...body.data,
      hashPassword,
      now: new Date(),
      secret: services.authConfig.secret,
    });
    return apiJson({ user }, { requestId, status: 201 });
  } catch (error) {
    if (error instanceof InvitationUnavailableError) {
      return apiError(
        "INVITATION_UNAVAILABLE",
        "The invitation is invalid, expired, revoked, or already used.",
        { requestId, status: 400 },
      );
    }
    return apiError(
      "INVITATION_UNAVAILABLE",
      "The invitation could not be accepted.",
      { requestId, status: 503 },
    );
  }
}
