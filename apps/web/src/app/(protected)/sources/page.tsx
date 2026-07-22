import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SourceManager } from "../../../components/source-manager";
import { getAuthenticatedSession } from "../../../lib/auth/session";

export const metadata: Metadata = { title: "Sources" };
export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const session = await getAuthenticatedSession(await headers());
  if (!session || session.user.role !== "ADMIN") redirect("/");
  return (
    <>
      <p className="eyebrow">Administration</p>
      <h1>Sources</h1>
      <p className="lede">
        Configure paused provider placeholders now. Live provider connectivity
        is introduced in the connector-specific milestones.
      </p>
      <SourceManager />
    </>
  );
}
