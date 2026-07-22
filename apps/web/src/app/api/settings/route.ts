import console from "node:console";
import { z } from "zod";

import { apiError, apiJson } from "../../../lib/api-response";
import {
  readHistorySetting,
  updateHistorySetting,
} from "../../../lib/actions/action-service";
import { getActionServices } from "../../../lib/actions/server";
import { requireApiSession } from "../../../lib/auth/api-session";
import { isSameOriginJsonMutation } from "../../../lib/auth/request-security";
import { getAuthServices } from "../../../lib/auth/server";
import { readBoundedJson } from "../../../lib/bounded-json";

const updateSchema = z.object({ historyEnabled: z.boolean() }).strict();

export async function GET(request: Request): Promise<Response> {
  const authentication = await requireApiSession(request);
  if ("response" in authentication) return authentication.response;
  const historyEnabled = await readHistorySetting(getActionServices());
  return apiJson(
    { settings: { historyEnabled } },
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
    const historyEnabled = await updateHistorySetting(
      getActionServices(),
      authentication.session.user.id,
      body.data.historyEnabled,
    );
    return apiJson(
      { settings: { historyEnabled } },
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
