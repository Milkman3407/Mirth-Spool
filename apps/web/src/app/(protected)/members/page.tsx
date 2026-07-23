import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { MemberAdministration } from "../../../components/member-administration";
import { listInvitations } from "../../../lib/auth/invitation-service";
import { listMembers } from "../../../lib/auth/member-administration";
import { getAuthenticatedSession } from "../../../lib/auth/session";
import { getAuthServices } from "../../../lib/auth/server";

export const metadata: Metadata = { title: "Members" };
export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const authentication = await getAuthenticatedSession(await headers());
  if (!authentication || authentication.user.role !== "ADMIN") redirect("/");
  const [invitations, members] = await Promise.all([
    listInvitations(getAuthServices().database),
    listMembers(getAuthServices().database),
  ]);
  return (
    <div className="settings-page">
      <p className="eyebrow">Administration</p>
      <h1>Members</h1>
      <p className="lede">
        Accounts are invitation-only. Invitation secrets are shown once and are
        never stored in plaintext.
      </p>
      <MemberAdministration
        initialInvitations={invitations.map((item) => ({
          acceptedAt: item.acceptedAt?.toISOString() ?? null,
          email: item.email,
          expiresAt: item.expiresAt.toISOString(),
          id: item.id,
          revokedAt: item.revokedAt?.toISOString() ?? null,
        }))}
        initialMembers={members.map((item) => ({
          disabledAt: item.disabledAt?.toISOString() ?? null,
          email: item.email,
          id: item.id,
          name: item.name,
          role: item.role,
        }))}
      />
    </div>
  );
}
