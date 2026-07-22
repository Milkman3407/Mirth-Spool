import { readLibraryRoute } from "../../../../lib/library/library-route";

export function GET(request: Request) {
  return readLibraryRoute(request, "history");
}
