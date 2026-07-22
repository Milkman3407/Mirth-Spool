import { z } from "zod";

import { apiError, apiJson } from "../../../../lib/api-response";
import { requireApiSession } from "../../../../lib/auth/api-session";
import { evaluatePasswordPolicy } from "../../../../lib/auth/password-policy";
import { hashPassword, verifyPassword } from "../../../../lib/auth/password";
import {
  consumeRateLimit,
  hashRateLimitSubject,
} from "../../../../lib/auth/rate-limit";
import { isSameOriginJsonMutation } from "../../../../lib/auth/request-security";
import { getAuthServices } from "../../../../lib/auth/server";

const passwordBodySchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(1).max(128),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  const { authConfig, authenticationRateLimitStore, database } =
    getAuthServices();
  const authentication = await requireApiSession(request);
  if ("response" in authentication) {
    return authentication.response;
  }
  if (!isSameOriginJsonMutation(request, authConfig.publicOrigin)) {
    return apiError("CSRF_REJECTED", "The request could not be verified.", {
      requestId: authentication.requestId,
      status: 403,
    });
  }
  const parsed = passwordBodySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return apiError("VALIDATION_FAILED", "The password change is invalid.", {
      requestId: authentication.requestId,
      status: 400,
    });
  }
  try {
    const limit = await consumeRateLimit(authenticationRateLimitStore, {
      key: `password:${hashRateLimitSubject(
        authConfig.secret,
        "password-change",
        authentication.session.user.id,
      )}`,
      limit: 5,
      windowSeconds: 900,
    });
    if (!limit.allowed) {
      return apiError(
        "AUTH_RATE_LIMITED",
        "Too many attempts. Try again later.",
        {
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
          requestId: authentication.requestId,
          status: 429,
        },
      );
    }
    const policy = evaluatePasswordPolicy({
      email: authentication.session.user.email,
      name: authentication.session.user.name,
      password: parsed.data.newPassword,
    });
    if (!policy.valid) {
      return apiError(
        "PASSWORD_POLICY_REJECTED",
        "Choose a stronger password.",
        {
          requestId: authentication.requestId,
          status: 400,
        },
      );
    }
    const account = await database.credentialAccount.findFirst({
      select: { id: true, passwordHash: true },
      where: {
        providerId: "credential",
        userId: authentication.session.user.id,
      },
    });
    if (
      !account ||
      !(await verifyPassword({
        hash: account.passwordHash,
        password: parsed.data.currentPassword,
      }))
    ) {
      return apiError(
        "AUTHENTICATION_FAILED",
        "The current password was not accepted.",
        {
          requestId: authentication.requestId,
          status: 401,
        },
      );
    }
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await database.$transaction([
      database.credentialAccount.update({
        data: { passwordHash },
        where: { id: account.id },
      }),
      database.session.deleteMany({
        where: {
          id: { not: authentication.session.session.id },
          userId: authentication.session.user.id,
        },
      }),
      database.auditEvent.create({
        data: {
          actorUserId: authentication.session.user.id,
          eventType: "AUTH_PASSWORD_CHANGED",
          targetId: authentication.session.user.id,
          targetType: "User",
        },
      }),
    ]);
    return apiJson(
      { changed: true, otherSessionsRevoked: true },
      {
        requestId: authentication.requestId,
      },
    );
  } catch {
    return apiError(
      "AUTHENTICATION_UNAVAILABLE",
      "Authentication is temporarily unavailable.",
      {
        requestId: authentication.requestId,
        status: 503,
      },
    );
  }
}
