import console from "node:console";
import { z } from "zod";

import { apiError, apiJson } from "../../../lib/api-response";
import {
  readSetting,
  readUserPreferences,
  writeUserPreferences,
} from "../../../../../../packages/db/dist/index";
import { getActionServices } from "../../../lib/actions/server";
import { requireApiSession } from "../../../lib/auth/api-session";
import { isSameOriginJsonMutation } from "../../../lib/auth/request-security";
import { getAuthServices } from "../../../lib/auth/server";
import { readBoundedJson } from "../../../lib/bounded-json";

const updateSchema = z
  .object({
    defaultFeedMode: z
      .enum(["new", "hot", "random", "unseen", "for-you"])
      .optional(),
    historyEnabled: z.boolean().optional(),
    maximumContentRating: z
      .enum(["SAFE", "SENSITIVE", "ADULT", "UNKNOWN"])
      .optional(),
    recommendationsEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export async function GET(request: Request): Promise<Response> {
  const authentication = await requireApiSession(request);
  if ("response" in authentication) return authentication.response;
  const services = getActionServices();
  const [settings, globalMaximumRating] = await Promise.all([
    readUserPreferences(services.database, authentication.session.user.id),
    readSetting(services.database, "content.maximumRating"),
  ]);
  return apiJson(
    { globalMaximumRating, settings },
    { requestId: authentication.requestId },
  );
}

export async function PATCH(request: Request): Promise<Response> {
  const authentication = await requireApiSession(request);
  if ("response" in authentication) return authentication.response;
  if (
    !isSameOriginJsonMutation(
      request,
      getAuthServices().authConfig.publicOrigin,
    )
  ) {
    return apiError("CSRF_REJECTED", "The request could not be verified.", {
      requestId: authentication.requestId,
      status: 403,
    });
  }
  const boundedBody = await readBoundedJson(request, {
    maxBytes: 1_024,
    requestId: authentication.requestId,
  });
  if ("response" in boundedBody) return boundedBody.response;
  const body = updateSchema.safeParse(boundedBody.value);
  if (!body.success) {
    return apiError("VALIDATION_FAILED", "The settings update is invalid.", {
      requestId: authentication.requestId,
      status: 400,
    });
  }
  try {
    const services = getActionServices();
    const settings = await services.database.$transaction(
      async (transaction) => {
        const updated = await writeUserPreferences(
          transaction,
          authentication.session.user.id,
          body.data,
        );
        if (body.data.historyEnabled === false) {
          await transaction.userAction.deleteMany({
            where: {
              kind: "VIEW",
              userId: authentication.session.user.id,
            },
          });
        }
        if (body.data.recommendationsEnabled === false) {
          await transaction.recommendationProfile.deleteMany({
            where: { userId: authentication.session.user.id },
          });
        }
        return updated;
      },
    );
    const globalMaximumRating = await readSetting(
      services.database,
      "content.maximumRating",
    );
    return apiJson(
      { globalMaximumRating, settings },
      { requestId: authentication.requestId },
    );
  } catch {
    console.error(
      JSON.stringify({
        event: "settings.update.failed",
        requestId: authentication.requestId,
      }),
    );
    return apiError(
      "SETTINGS_UNAVAILABLE",
      "The setting could not be saved. Try again.",
      { requestId: authentication.requestId, status: 503 },
    );
  }
}
