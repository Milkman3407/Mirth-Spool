import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const routeRoot = path.resolve("apps/web/src/app/api");
const publicRoutes = new Set([
  "auth/[...all]/route.ts",
  "health/live/route.ts",
  "health/ready/route.ts",
  "invitations/accept/route.ts",
  "setup/route.ts",
  "setup/status/route.ts",
]);

function findRouteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return findRouteFiles(absolute);
    return entry.name === "route.ts" ? [absolute] : [];
  });
}

function relativeRoute(file: string): string {
  return path.relative(routeRoot, file).replaceAll("\\", "/");
}

describe("API authorization matrix", () => {
  const routes = findRouteFiles(routeRoot);

  it("keeps public endpoints limited to the explicit invitation and bootstrap surface", () => {
    const discoveredPublic = routes
      .map(relativeRoute)
      .filter(
        (route) =>
          !route.startsWith("admin/") &&
          !route.startsWith("sources/") &&
          publicRoutes.has(route),
      );

    expect(new Set(discoveredPublic)).toEqual(publicRoutes);
  });

  it("requires an administrator session for every administrative route", () => {
    const administrativeRoutes = routes.filter((file) => {
      const route = relativeRoute(file);
      return route.startsWith("admin/") || route.startsWith("sources/");
    });

    expect(administrativeRoutes.length).toBeGreaterThan(0);
    for (const file of administrativeRoutes) {
      expect(readFileSync(file, "utf8"), relativeRoute(file)).toContain(
        "requireAdminApiSession",
      );
    }
  });

  it("requires a user session for every non-public, non-administrative route", () => {
    const authenticatedRoutes = routes.filter((file) => {
      const route = relativeRoute(file);
      return (
        !publicRoutes.has(route) &&
        !route.startsWith("admin/") &&
        !route.startsWith("sources/")
      );
    });

    expect(authenticatedRoutes.length).toBeGreaterThan(0);
    for (const file of authenticatedRoutes) {
      const source = readFileSync(file, "utf8");
      const delegatesToProtectedAction = source.includes("mutateContentAction");
      const delegatesToProtectedLibrary = source.includes("readLibraryRoute");
      expect(
        source.includes("requireApiSession") ||
          delegatesToProtectedAction ||
          delegatesToProtectedLibrary,
        relativeRoute(file),
      ).toBe(true);
    }

    expect(
      readFileSync(
        path.resolve("apps/web/src/lib/actions/action-route.ts"),
        "utf8",
      ),
    ).toContain("requireApiSession");
    expect(
      readFileSync(
        path.resolve("apps/web/src/lib/library/library-route.ts"),
        "utf8",
      ),
    ).toContain("requireApiSession");
  });
});
