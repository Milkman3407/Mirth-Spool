import Link from "next/link";
import type { ReactNode } from "react";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header public-header">
        <Link className="brand" href="/">
          Mirth<span className="brand-mark">Spool</span>
        </Link>
      </header>
      <main className="auth-main" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
