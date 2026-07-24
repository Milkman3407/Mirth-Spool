import { apiError, apiJson } from "../../../../../lib/api-response";
import { getActionServices } from "../../../../../lib/actions/server";
import { requireApiSession } from "../../../../../lib/auth/api-session";
import { isSameOriginJsonMutation } from "../../../../../lib/auth/request-security";
import { getAuthServices } from "../../../../../lib/auth/server";

export async function POST(request: Request): Promise<Response> {
  const authentication = await requireApiSession(request);
  if ("response" in authentication) return authentication.response;
  if (
    !isSameOriginJsonMutation(
      request,
      getAuthServices().authConfig.publicOrigin,
    )
  )
    return apiError("CSRF_REJECTED", "The request could not be verified.", {
      requestId: authentication.requestId,
      status: 403,
    });
  const database = getActionServices().database;
  const resetAt = new Date();
  await database.$transaction([
    database.recommendationProfile.deleteMany({
      where: { userId: authentication.session.user.id },
    }),
    database.userPreference.upsert({
      create: {
        recommendationResetAt: resetAt,
        userId: authentication.session.user.id,
      },
      update: { recommendationResetAt: resetAt },
      where: { userId: authentication.session.user.id },
    }),
  ]);
  return apiJson(
    { resetAt: resetAt.toISOString() },
    { requestId: authentication.requestId },
  );
}
