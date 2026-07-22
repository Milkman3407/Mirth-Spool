import { apiJson } from "../../../../lib/api-response";
import { requireApiSession } from "../../../../lib/auth/api-session";
import { getAuthServices } from "../../../../lib/auth/server";

export async function GET(request: Request): Promise<Response> {
  const { database } = getAuthServices();
  const authentication = await requireApiSession(request);
  if ("response" in authentication) {
    return authentication.response;
  }
  const sessions = await database.session.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      expires: true,
      id: true,
      userAgent: true,
    },
    take: 25,
    where: {
      expires: { gt: new Date() },
      revokedAt: null,
      userId: authentication.session.user.id,
    },
  });
  return apiJson(
    {
      items: sessions.map((session) => ({
        createdAt: session.createdAt.toISOString(),
        current: session.id === authentication.session.session.id,
        expiresAt: session.expires.toISOString(),
        id: session.id,
        userAgent: session.userAgent?.slice(0, 160) ?? null,
      })),
    },
    { requestId: authentication.requestId },
  );
}
