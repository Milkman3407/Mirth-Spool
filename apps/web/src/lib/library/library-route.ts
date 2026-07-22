import console from "node:console";

import type { LibraryKind } from "../../../../../packages/db/dist/index";
import { apiError, apiJson } from "../api-response";
import { requireApiSession } from "../auth/api-session";
import { HistoryDisabledError, readLibrary } from "./library-service";
import { getLibraryServices } from "./server";

export async function readLibraryRoute(request: Request, kind: LibraryKind) {
  const authentication = await requireApiSession(request);
  if ("response" in authentication) return authentication.response;
  try {
    const page = await readLibrary(
      getLibraryServices(),
      authentication.session.user.id,
      kind,
      request.url,
    );
    return apiJson(page, { requestId: authentication.requestId });
  } catch (error) {
    if (error instanceof HistoryDisabledError) {
      return apiError(
        "HISTORY_DISABLED",
        "Detailed view history is disabled.",
        { requestId: authentication.requestId, status: 409 },
      );
    }
    const invalidCursor =
      error instanceof Error && error.message === "INVALID_CURSOR";
    console.error(
      JSON.stringify({
        event: "library.query.failed",
        kind,
        requestId: authentication.requestId,
      }),
    );
    return apiError(
      invalidCursor ? "INVALID_CURSOR" : "VALIDATION_FAILED",
      invalidCursor
        ? "The library cursor is invalid or incompatible with this view."
        : "The library query is invalid.",
      { requestId: authentication.requestId, status: 400 },
    );
  }
}
