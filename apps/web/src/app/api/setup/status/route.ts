import { apiJson, requestIdFrom } from "../../../../lib/api-response";
import { isSetupOpen } from "../../../../lib/auth/setup-service";
import { getAuthServices } from "../../../../lib/auth/server";

export async function GET(request: Request): Promise<Response> {
  const { database } = getAuthServices();
  const requestId = requestIdFrom(request);
  return apiJson({ open: await isSetupOpen(database) }, { requestId });
}
