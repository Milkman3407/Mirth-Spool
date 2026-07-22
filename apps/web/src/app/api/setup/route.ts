import { z } from "zod";

import { apiError, apiJson, requestIdFrom } from "../../../lib/api-response";
import {
  evaluatePasswordPolicy,
  normalizeEmail,
} from "../../../lib/auth/password-policy";
import { hashPassword } from "../../../lib/auth/password";
import {
  consumeRateLimit,
  getClientAddress,
  hashRateLimitSubject,
} from "../../../lib/auth/rate-limit";
import { isSameOriginJsonMutation } from "../../../lib/auth/request-security";
import {
  createFirstAdministrator,
  SetupClosedError,
} from "../../../lib/auth/setup-service";
import { getAuthServices } from "../../../lib/auth/server";

const setupBodySchema = z
  .object({
    email: z.email().max(320),
    name: z.string().trim().min(1).max(100),
    password: z.string().min(1).max(128),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  const { auth, authConfig, authenticationRateLimitStore, database } =
    getAuthServices();
  const requestId = requestIdFrom(request);
  if (!isSameOriginJsonMutation(request, authConfig.publicOrigin)) {
    return apiError("CSRF_REJECTED", "The request could not be verified.", {
      requestId,
      status: 403,
    });
  }
  const parsed = setupBodySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return apiError("VALIDATION_FAILED", "The setup details are invalid.", {
      requestId,
      status: 400,
    });
  }
  const email = normalizeEmail(parsed.data.email);
  const passwordPolicy = evaluatePasswordPolicy({ ...parsed.data, email });
  if (!passwordPolicy.valid) {
    return apiError("PASSWORD_POLICY_REJECTED", "Choose a stronger password.", {
      requestId,
      status: 400,
    });
  }

  try {
    const address = getClientAddress(
      request.headers,
      authConfig.trustedProxyAddresses,
    );
    const [ipLimit, accountLimit] = await Promise.all([
      consumeRateLimit(authenticationRateLimitStore, {
        key: `setup-ip:${hashRateLimitSubject(authConfig.secret, "setup-ip", address)}`,
        limit: 5,
        windowSeconds: 900,
      }),
      consumeRateLimit(authenticationRateLimitStore, {
        key: `setup-account:${hashRateLimitSubject(authConfig.secret, "setup-account", email)}`,
        limit: 5,
        windowSeconds: 900,
      }),
    ]);
    if (!ipLimit.allowed || !accountLimit.allowed) {
      return apiError(
        "AUTH_RATE_LIMITED",
        "Too many setup attempts. Try again later.",
        {
          headers: {
            "Retry-After": String(
              Math.max(
                ipLimit.retryAfterSeconds,
                accountLimit.retryAfterSeconds,
              ),
            ),
          },
          requestId,
          status: 429,
        },
      );
    }

    const user = await createFirstAdministrator(database, {
      email,
      hashPassword,
      name: parsed.data.name,
      password: parsed.data.password,
    });
    const signIn = await auth.api.signInEmail({
      body: { email, password: parsed.data.password },
      headers: request.headers,
      returnHeaders: true,
    });
    const response = apiJson(
      {
        authenticated: true,
        user: { email: user.email, id: user.id, name: user.name },
      },
      { requestId, status: 201 },
    );
    for (const cookie of signIn.headers.getSetCookie()) {
      response.headers.append("set-cookie", cookie);
    }
    return response;
  } catch (error) {
    if (error instanceof SetupClosedError) {
      return apiError("SETUP_CLOSED", "First-run setup is closed.", {
        requestId,
        status: 409,
      });
    }
    return apiError("SETUP_UNAVAILABLE", "Setup is temporarily unavailable.", {
      requestId,
      status: 503,
    });
  }
}
