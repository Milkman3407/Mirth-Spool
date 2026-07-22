import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DuplicateManager } from "../../../components/duplicate-manager";
import { getAuthenticatedSession } from "../../../lib/auth/session";
import { readDuplicateAdministration } from "../../../lib/duplicates/duplicate-service";
import { getDuplicateServices } from "../../../lib/duplicates/server";

export const metadata: Metadata = { title: "Duplicate inspection" };
export const dynamic = "force-dynamic";

export default async function DuplicatesPage() {
  const authentication = await getAuthenticatedSession(await headers());
  if (!authentication) redirect("/login");
  if (authentication.user.role !== "ADMIN") redirect("/");
  const duplicateGroups = await readDuplicateAdministration(
    getDuplicateServices().database,
    { limit: 50 },
  );
  return (
    <div className="settings-page">
      <p className="eyebrow">Provenance controls</p>
      <h1>Duplicate inspection</h1>
      <p>
        Automatic decisions retain every source occurrence. Exact hashes are
        strongest; canonical URLs and perceptual similarity are conservative
        candidate signals.
      </p>
      <DuplicateManager groups={duplicateGroups.groups} />
    </div>
  );
}
