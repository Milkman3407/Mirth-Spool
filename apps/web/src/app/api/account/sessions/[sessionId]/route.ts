import { z } from "zod";

import { apiError, apiJson } from "../../../../../lib/api-response";
import { requireApiSession } from "../../../../../lib/auth/api-session";
import { recordAuditEvent } from "../../../../../lib/auth/audit";
import { isSameOriginJsonMutation } from "../../../../../lib/auth/request-security";
import { getAuthServices } from "../../../../../lib/auth/server";

const idSchema = z.uuid();

export async function DELETE(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { auth, authConfig, database } = getAuthServices();
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
  const parsedId = idSchema.safeParse((await context.params).sessionId);
  if (!parsedId.success) {
    return apiError("VALIDATION_FAILED", "The session identifier is invalid.", {
      requestId: authentication.requestId,
      status: 400,
    });
  }
  const target = await database.session.findFirst({
    select: { id: true },
    where: { id: parsedId.data, userId: authentication.session.user.id },
  });
  if (!target) {
    return apiError("SESSION_NOT_FOUND", "The session was not found.", {
      requestId: authentication.requestId,
      status: 404,
    });
  }

  let cookieHeaders: Headers | undefined;
  if (target.id === authentication.session.session.id) {
    const signedOut = await auth.api.signOut({
      headers: request.headers,
      returnHeaders: true,
    });
    cookieHeaders = signedOut.headers;
  } else {
    await database.session.delete({ where: { id: target.id } });
  }
  await recordAuditEvent(database, {
    actorUserId: authentication.session.user.id,
    eventType: "AUTH_SESSION_REVOKED",
    targetId: target.id,
    targetType: "Session",
  });
  const response = apiJson(
    { revoked: true },
    { requestId: authentication.requestId },
  );
  for (const cookie of cookieHeaders?.getSetCookie() ?? []) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
