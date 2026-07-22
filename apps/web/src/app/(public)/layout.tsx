import Link from "next/link";
import type { ReactNode } from "react";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="site-header public-header">
        <Link className="brand" href="/">
          Mirth<span className="brand-mark">Spool</span>
        </Link>
      </header>
      <main className="auth-main">{children}</main>
    </>
  );
}
