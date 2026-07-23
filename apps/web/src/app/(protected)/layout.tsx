import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { LogoutButton } from "../../components/logout-button";
import { PrimaryNavigation } from "../../components/primary-navigation";
import { getAuthenticatedSession } from "../../lib/auth/session";
import { getAuthServices } from "../../lib/auth/server";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const requestHeaders = await headers();
  const session = await getAuthenticatedSession(requestHeaders);
  if (!session) {
    const userCount = await getAuthServices().database.user.count({ take: 1 });
    redirect(userCount === 0 ? "/setup" : "/login");
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <Link className="brand" href="/">
          Mirth<span className="brand-mark">Spool</span>
        </Link>
        <PrimaryNavigation role={session.user.role} />
        <div className="account-nav">
          <span title={session.user.email}>{session.user.name}</span>
          <LogoutButton />
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
