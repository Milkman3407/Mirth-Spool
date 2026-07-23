import { z } from "zod";

import { readSetting, writeSetting } from "@mirthspool/db";
import { apiError, apiJson } from "../../../../lib/api-response";
import { requireAdminApiSession } from "../../../../lib/auth/api-session";
import { recordAuditEvent } from "../../../../lib/auth/audit";
import { isSameOriginJsonMutation } from "../../../../lib/auth/request-security";
import { getAuthServices } from "../../../../lib/auth/server";
import { readBoundedJson } from "../../../../lib/bounded-json";

const schema = z
  .object({
    maximumContentRating: z.enum(["SAFE", "SENSITIVE", "ADULT", "UNKNOWN"]),
  })
  .strict();

export async function GET(request: Request): Promise<Response> {
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  const maximumContentRating = await readSetting(
    getAuthServices().database,
    "content.maximumRating",
  );
  return apiJson(
    { settings: { maximumContentRating } },
    { requestId: authentication.requestId },
  );
}

export async function PATCH(request: Request): Promise<Response> {
  const services = getAuthServices();
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  if (!isSameOriginJsonMutation(request, services.authConfig.publicOrigin)) {
    return apiError("CSRF_REJECTED", "The request could not be verified.", {
      requestId: authentication.requestId,
      status: 403,
    });
  }
  const bounded = await readBoundedJson(request, {
    maxBytes: 256,
    requestId: authentication.requestId,
  });
  if ("response" in bounded) return bounded.response;
  const body = schema.safeParse(bounded.value);
  if (!body.success) {
    return apiError("VALIDATION_FAILED", "The global policy is invalid.", {
      requestId: authentication.requestId,
      status: 400,
    });
  }
  await services.database.$transaction(async (transaction) => {
    await writeSetting(
      transaction,
      "content.maximumRating",
      body.data.maximumContentRating,
    );
    await recordAuditEvent(transaction, {
      actorUserId: authentication.session.user.id,
      eventType: "GLOBAL_CONTENT_POLICY_UPDATED",
      metadata: {
        maximumContentRating: body.data.maximumContentRating,
      },
      targetType: "AppSetting",
    });
  });
  return apiJson(
    { settings: body.data },
    { requestId: authentication.requestId },
  );
}
