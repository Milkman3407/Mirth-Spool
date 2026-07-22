import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SecurityControls } from "../../../../components/security-controls";
import { getAuthenticatedSession } from "../../../../lib/auth/session";
import { getAuthServices } from "../../../../lib/auth/server";

export const metadata: Metadata = { title: "Account security" };

export default async function AccountSecurityPage() {
  const authentication = await getAuthenticatedSession(await headers());
  if (!authentication) redirect("/login");
  const sessions = await getAuthServices().database.session.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    where: {
      expires: { gt: new Date() },
      revokedAt: null,
      userId: authentication.user.id,
    },
  });
  return (
    <>
      <p className="eyebrow">Account</p>
      <h1>Security</h1>
      <p className="lede">
        Review sessions, revoke access, or rotate your password.
      </p>
      <SecurityControls
        initialSessions={sessions.map((session) => ({
          createdAt: session.createdAt.toISOString(),
          current: session.id === authentication.session.id,
          expiresAt: session.expires.toISOString(),
          id: session.id,
          userAgent: session.userAgent?.slice(0, 160) ?? null,
        }))}
      />
    </>
  );
}
