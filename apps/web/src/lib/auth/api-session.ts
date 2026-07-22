import "server-only";

import { apiError, requestIdFrom } from "../api-response";
import { getAuthenticatedSession, type AuthenticatedSession } from "./session";

export async function requireApiSession(
  request: Request,
): Promise<
  | { readonly requestId: string; readonly session: AuthenticatedSession }
  | { readonly response: Response }
> {
  const requestId = requestIdFrom(request);
  const session = await getAuthenticatedSession(request.headers);
  if (!session) {
    return {
      response: apiError(
        "AUTHENTICATION_REQUIRED",
        "Authentication is required.",
        {
          requestId,
          status: 401,
        },
      ),
    };
  }
  return Object.freeze({ requestId, session });
}

export async function requireAdminApiSession(
  request: Request,
): Promise<
  | { readonly requestId: string; readonly session: AuthenticatedSession }
  | { readonly response: Response }
> {
  const authentication = await requireApiSession(request);
  if ("response" in authentication) return authentication;
  if (authentication.session.user.role !== "ADMIN") {
    return {
      response: apiError(
        "AUTHORIZATION_REQUIRED",
        "Administrator access is required.",
        {
          requestId: authentication.requestId,
          status: 403,
        },
      ),
    };
  }
  return authentication;
}
