import type { z } from "zod";

import { apiError } from "../api-response";
import { readBoundedJson } from "../bounded-json";
import { isSameOriginJsonMutation } from "../auth/request-security";
import { getAuthServices } from "../auth/server";
import { SourceServiceError } from "./source-service";

export async function parseSourceRequest<T>(
  request: Request,
  requestId: string,
  schema: z.ZodType<T>,
): Promise<{ readonly value: T } | { readonly response: Response }> {
  const authConfig = getAuthServices().authConfig;
  if (!isSameOriginJsonMutation(request, authConfig.publicOrigin)) {
    return {
      response: apiError(
        "CSRF_REJECTED",
        "The request could not be verified.",
        {
          requestId,
          status: 403,
        },
      ),
    };
  }
  const body = await readBoundedJson(request, { maxBytes: 32_768, requestId });
  if ("response" in body) return body;
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) {
    return {
      response: apiError(
        "VALIDATION_FAILED",
        "The source request is invalid.",
        {
          requestId,
          status: 400,
        },
      ),
    };
  }
  return { value: parsed.data };
}

export function sourceApiFailure(error: unknown, requestId: string): Response {
  if (error instanceof SourceServiceError) {
    return apiError(error.code, error.message, {
      requestId,
      status: error.status,
    });
  }
  return apiError(
    "SOURCE_OPERATION_FAILED",
    "The source operation could not be completed.",
    {
      requestId,
      status: 503,
    },
  );
}
