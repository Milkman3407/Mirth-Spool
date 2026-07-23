import { z } from "zod";

import { apiError, apiJson } from "../../../../../lib/api-response";
import { requireAdminApiSession } from "../../../../../lib/auth/api-session";
import {
  deleteMember,
  revokeMemberSessions,
  setMemberDisabled,
} from "../../../../../lib/auth/member-administration";
import { isSameOriginJsonMutation } from "../../../../../lib/auth/request-security";
import { getAuthServices } from "../../../../../lib/auth/server";
import { readBoundedJson } from "../../../../../lib/bounded-json";

const actionSchema = z
  .object({ action: z.enum(["disable", "enable", "revoke_sessions"]) })
  .strict();

export async function PATCH(
  request: Request,
  context: { readonly params: Promise<{ readonly userId: string }> },
): Promise<Response> {
  const services = getAuthServices();
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  if (!isSameOriginJsonMutation(request, services.authConfig.publicOrigin)) {
    return csrf(authentication.requestId);
  }
  const userId = z.uuid().safeParse((await context.params).userId);
  const bounded = await readBoundedJson(request, {
    maxBytes: 256,
    requestId: authentication.requestId,
  });
  if (!userId.success || "response" in bounded) {
    return "response" in bounded
      ? bounded.response
      : validation(authentication.requestId);
  }
  const body = actionSchema.safeParse(bounded.value);
  if (!body.success) return validation(authentication.requestId);
  try {
    if (body.data.action === "revoke_sessions") {
      const revoked = await revokeMemberSessions(
        services.database,
        authentication.session.user.id,
        userId.data,
      );
      return apiJson(
        { sessionsRevoked: revoked },
        { requestId: authentication.requestId },
      );
    }
    await setMemberDisabled(services.database, {
      actorUserId: authentication.session.user.id,
      disabled: body.data.action === "disable",
      now: new Date(),
      userId: userId.data,
    });
    return apiJson(
      { disabled: body.data.action === "disable" },
      { requestId: authentication.requestId },
    );
  } catch {
    return notFound(authentication.requestId);
  }
}

export async function DELETE(
  request: Request,
  context: { readonly params: Promise<{ readonly userId: string }> },
): Promise<Response> {
  const services = getAuthServices();
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  if (!isSameOriginJsonMutation(request, services.authConfig.publicOrigin)) {
    return csrf(authentication.requestId);
  }
  const userId = z.uuid().safeParse((await context.params).userId);
  if (!userId.success) return validation(authentication.requestId);
  try {
    await deleteMember(
      services.database,
      authentication.session.user.id,
      userId.data,
    );
    return apiJson({ deleted: true }, { requestId: authentication.requestId });
  } catch {
    return notFound(authentication.requestId);
  }
}

function csrf(requestId: string) {
  return apiError("CSRF_REJECTED", "The request could not be verified.", {
    requestId,
    status: 403,
  });
}

function validation(requestId: string) {
  return apiError("VALIDATION_FAILED", "The member request is invalid.", {
    requestId,
    status: 400,
  });
}

function notFound(requestId: string) {
  return apiError("MEMBER_NOT_FOUND", "The member was not found.", {
    requestId,
    status: 404,
  });
}
