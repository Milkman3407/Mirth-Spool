import console from "node:console";
import { z } from "zod";

import { apiError, apiJson } from "../api-response";
import { requireApiSession } from "../auth/api-session";
import { isSameOriginJsonMutation } from "../auth/request-security";
import { getAuthServices } from "../auth/server";
import { readBoundedJson } from "../bounded-json";
import {
  ActionContentNotFoundError,
  recordContentView,
  setContentAction,
} from "./action-service";
import { getActionServices } from "./server";

const emptyBodySchema = z.object({}).strict();

export async function mutateContentAction(
  request: Request,
  context: { readonly params: Promise<{ readonly contentId: string }> },
  input: Readonly<{
    enabled: boolean;
    kind: "FAVORITE" | "HIDE" | "VIEW";
  }>,
): Promise<Response> {
  const authentication = await requireApiSession(request);
  if ("response" in authentication) return authentication.response;
  const contentId = z.uuid().safeParse((await context.params).contentId);
  if (!contentId.success) {
    return apiError("VALIDATION_FAILED", "The content identifier is invalid.", {
      requestId: authentication.requestId,
      status: 400,
    });
  }
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
    maxBytes: 128,
    requestId: authentication.requestId,
  });
  if ("response" in boundedBody) return boundedBody.response;
  const body = emptyBodySchema.safeParse(boundedBody.value);
  if (!body.success) {
    return apiError("VALIDATION_FAILED", "The action request is invalid.", {
      requestId: authentication.requestId,
      status: 400,
    });
  }

  try {
    const actionState =
      input.kind === "VIEW"
        ? await recordContentView(
            getActionServices(),
            authentication.session.user.id,
            contentId.data,
          )
        : await setContentAction(
            getActionServices(),
            authentication.session.user.id,
            contentId.data,
            input.kind,
            input.enabled,
          );
    return apiJson(
      { actionState, contentId: contentId.data },
      { requestId: authentication.requestId },
    );
  } catch (error) {
    if (error instanceof ActionContentNotFoundError) {
      return apiError("CONTENT_NOT_FOUND", "The content item was not found.", {
        requestId: authentication.requestId,
        status: 404,
      });
    }
    console.error(
      JSON.stringify({
        event: "content.action.failed",
        kind: input.kind,
        requestId: authentication.requestId,
      }),
    );
    return apiError(
      "ACTION_UNAVAILABLE",
      "The action could not be saved. Try again.",
      { requestId: authentication.requestId, status: 503 },
    );
  }
}
