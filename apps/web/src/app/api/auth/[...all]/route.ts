import { toNextJsHandler } from "better-auth/next-js";
import { z } from "zod";

import { apiError, apiJson, requestIdFrom } from "../../../../lib/api-response";
import { recordAuditEvent } from "../../../../lib/auth/audit";
import { mapAuthenticationError } from "../../../../lib/auth/authentication-error";
import { normalizeEmail } from "../../../../lib/auth/password-policy";
import {
  consumeRateLimit,
  getClientAddress,
  hashRateLimitSubject,
} from "../../../../lib/auth/rate-limit";
import { getAuthenticatedSession } from "../../../../lib/auth/session";
import { getAuthServices } from "../../../../lib/auth/server";

const signInBodySchema = z
  .object({
    email: z.email().max(320),
    password: z.string().min(1).max(128),
    rememberMe: z.boolean().optional(),
  })
  .strict();

function authPath(request: Request): string {
  return new URL(request.url).pathname.slice("/api/auth".length);
}

function responseWithCookies(
  upstream: Response | Headers,
  body: unknown,
  requestId: string,
  status = 200,
): Response {
  const sourceHeaders =
    upstream instanceof Response ? upstream.headers : upstream;
  const response = apiJson(body, { requestId, status });
  for (const cookie of sourceHeaders.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

async function consumeLoginLimits(request: Request, email: string) {
  const { authConfig, authenticationRateLimitStore } = getAuthServices();
  const address = getClientAddress(
    request.headers,
    authConfig.trustedProxyAddresses,
  );
  const addressSubject = hashRateLimitSubject(
    authConfig.secret,
    "login-ip",
    address,
  );
  const accountSubject = hashRateLimitSubject(
    authConfig.secret,
    "login-account",
    normalizeEmail(email),
  );
  const [addressDecision, accountDecision] = await Promise.all([
    consumeRateLimit(authenticationRateLimitStore, {
      key: `login-ip:${addressSubject}`,
      limit: 10,
      windowSeconds: 900,
    }),
    consumeRateLimit(authenticationRateLimitStore, {
      key: `login-account:${accountSubject}`,
      limit: 5,
      windowSeconds: 900,
    }),
  ]);
  return Object.freeze({
    accountSubject,
    allowed: addressDecision.allowed && accountDecision.allowed,
    count: accountDecision.count,
    retryAfterSeconds: Math.max(
      addressDecision.retryAfterSeconds,
      accountDecision.retryAfterSeconds,
    ),
  });
}

export async function GET(request: Request): Promise<Response> {
  const requestId = requestIdFrom(request);
  if (authPath(request) !== "/get-session") {
    return apiError("NOT_FOUND", "The requested endpoint does not exist.", {
      requestId,
      status: 404,
    });
  }
  const session = await getAuthenticatedSession(request.headers);
  return apiJson(session, { requestId });
}

export async function POST(request: Request): Promise<Response> {
  const { auth, database } = getAuthServices();
  const handlers = toNextJsHandler(auth);
  const requestId = requestIdFrom(request);
  const path = authPath(request);

  if (path === "/sign-out") {
    const session = await getAuthenticatedSession(request.headers);
    if (!session) {
      return apiError(
        "AUTHENTICATION_REQUIRED",
        "Authentication is required.",
        {
          requestId,
          status: 401,
        },
      );
    }
    try {
      const signedOut = await auth.api.signOut({
        headers: request.headers,
        returnHeaders: true,
      });
      await recordAuditEvent(database, {
        actorUserId: session.user.id,
        eventType: "AUTH_LOGOUT",
        targetId: session.session.id,
        targetType: "Session",
      });
      return responseWithCookies(
        signedOut.headers,
        { success: true },
        requestId,
      );
    } catch {
      return apiError(
        "AUTHENTICATION_UNAVAILABLE",
        "Authentication is temporarily unavailable.",
        { requestId, status: 503 },
      );
    }
  }

  if (path !== "/sign-in/email") {
    return apiError("NOT_FOUND", "The requested endpoint does not exist.", {
      requestId,
      status: 404,
    });
  }

  const parsed = signInBodySchema.safeParse(
    await request
      .clone()
      .json()
      .catch(() => null),
  );
  if (!parsed.success) {
    return apiError(
      "AUTHENTICATION_FAILED",
      "The supplied credentials were not accepted.",
      {
        requestId,
        status: 401,
      },
    );
  }

  try {
    const limit = await consumeLoginLimits(request, parsed.data.email);
    if (!limit.allowed) {
      if (limit.count === 6) {
        await recordAuditEvent(database, {
          eventType: "AUTH_LOGIN_FAILURE_THRESHOLD",
          metadata: {
            attemptBucket: 6,
            subject: limit.accountSubject.slice(0, 32),
          },
        });
      }
      return apiError(
        "AUTH_RATE_LIMITED",
        "Too many authentication attempts. Try again later.",
        {
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
          requestId,
          status: 429,
        },
      );
    }

    const response = await handlers.POST(request);
    const user = await database.user.findUnique({
      where: { emailNormalized: normalizeEmail(parsed.data.email) },
      select: {
        disabledAt: true,
        email: true,
        id: true,
        name: true,
        role: true,
      },
    });
    if (response.ok && user && !user.disabledAt) {
      await database.$transaction([
        database.user.update({
          data: { lastLoginAt: new Date() },
          where: { id: user.id },
        }),
        database.auditEvent.create({
          data: {
            actorUserId: user.id,
            eventType: "AUTH_LOGIN_SUCCEEDED",
            targetId: user.id,
            targetType: "User",
          },
        }),
      ]);
      return responseWithCookies(
        response,
        {
          user: {
            email: user.email,
            id: user.id,
            name: user.name,
            role: user.role,
          },
        },
        requestId,
      );
    }
    if (response.ok && user?.disabledAt) {
      await database.session.deleteMany({ where: { userId: user.id } });
    }
    if (limit.count === 3) {
      await recordAuditEvent(database, {
        eventType: "AUTH_LOGIN_FAILURE_THRESHOLD",
        metadata: {
          attemptBucket: 3,
          subject: limit.accountSubject.slice(0, 32),
        },
      });
    }
    const safe = mapAuthenticationError(response.ok ? 401 : response.status);
    return apiError(safe.code, safe.message, {
      requestId,
      status: safe.status,
    });
  } catch {
    return apiError(
      "AUTHENTICATION_UNAVAILABLE",
      "Authentication is temporarily unavailable.",
      { requestId, status: 503 },
    );
  }
}
