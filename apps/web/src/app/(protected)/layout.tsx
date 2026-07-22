import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { LogoutButton } from "../../components/logout-button";
import { getAuthenticatedSession } from "../../lib/auth/session";
import { getAuthServices } from "../../lib/auth/server";

const navigation = [
  { href: "/", label: "Feed" },
  { href: "/sources", label: "Sources" },
  { href: "/settings", label: "Settings" },
  { href: "/status", label: "Status" },
  { href: "/account/security", label: "Security" },
] as const;

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
      <header className="site-header">
        <Link className="brand" href="/">
          Mirth<span className="brand-mark">Spool</span>
        </Link>
        <nav aria-label="Primary navigation" className="primary-nav">
          <ul>
            {navigation.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="account-nav">
          <span title={session.user.email}>{session.user.name}</span>
          <LogoutButton />
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
