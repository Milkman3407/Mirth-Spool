import { apiJson } from "../../../../lib/api-response";
import { requireAdminApiSession } from "../../../../lib/auth/api-session";
import { listMembers } from "../../../../lib/auth/member-administration";
import { getAuthServices } from "../../../../lib/auth/server";

export async function GET(request: Request): Promise<Response> {
  const authentication = await requireAdminApiSession(request);
  if ("response" in authentication) return authentication.response;
  const items = await listMembers(getAuthServices().database);
  return apiJson(
    {
      items: items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        disabledAt: item.disabledAt?.toISOString() ?? null,
        lastLoginAt: item.lastLoginAt?.toISOString() ?? null,
      })),
    },
    { requestId: authentication.requestId },
  );
}
