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
    maximumContentRating: z
      .enum(["SAFE", "SENSITIVE", "ADULT", "UNKNOWN"])
      .optional(),
    recommendationWeights: z
      .object({
        favorite: z.number(),
        freshness: z.number(),
        hide: z.number(),
        media: z.number(),
        source: z.number(),
        sourcePriority: z.number(),
        tag: z.number(),
        view: z.number(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export async function GET(request: Request): Promise<Response> {
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  const [maximumContentRating, recommendationWeights] = await Promise.all([
    readSetting(getAuthServices().database, "content.maximumRating"),
    readSetting(getAuthServices().database, "recommendations.weights"),
  ]);
  return apiJson(
    { settings: { maximumContentRating, recommendationWeights } },
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
    maxBytes: 2_048,
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
    if (body.data.maximumContentRating)
      await writeSetting(
        transaction,
        "content.maximumRating",
        body.data.maximumContentRating,
      );
    if (body.data.recommendationWeights)
      await writeSetting(
        transaction,
        "recommendations.weights",
        body.data.recommendationWeights,
      );
    await recordAuditEvent(transaction, {
      actorUserId: authentication.session.user.id,
      eventType: "GLOBAL_CONTENT_POLICY_UPDATED",
      metadata: {
        changedKeys: Object.keys(body.data).sort().join(","),
      },
      targetType: "AppSetting",
    });
  });
  return apiJson(
    { settings: body.data },
    { requestId: authentication.requestId },
  );
}
