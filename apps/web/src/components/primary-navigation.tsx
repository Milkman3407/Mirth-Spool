"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const primary = [
  { href: "/", label: "Feed" },
  { href: "/search", label: "Search" },
  { href: "/library/favorites", label: "Favorites" },
] as const;

const secondary = [
  { href: "/library/hidden", label: "Hidden" },
  { href: "/library/history", label: "History" },
  { href: "/settings", label: "Settings" },
  { href: "/account/security", label: "Security" },
] as const;

const administration = [
  { href: "/sources", label: "Sources" },
  { href: "/duplicates", label: "Duplicates" },
  { href: "/members", label: "Members" },
  { href: "/status", label: "Status" },
] as const;

export function PrimaryNavigation({
  role,
}: {
  readonly role: "ADMIN" | "MEMBER";
}) {
  const pathname = usePathname();
  const visiblePrimary =
    role === "ADMIN" ? [...primary, administration[0]] : primary;
  const visibleSecondary =
    role === "ADMIN" ? [...secondary, ...administration.slice(1)] : secondary;
  const all = [...visiblePrimary, ...visibleSecondary];
  return (
    <>
      <nav aria-label="Primary navigation" className="primary-nav desktop-nav">
        <ul>
          {all.map((item) => (
            <NavigationLink item={item} key={item.href} pathname={pathname} />
          ))}
        </ul>
      </nav>
      <nav aria-label="Mobile navigation" className="mobile-nav">
        <ul>
          {visiblePrimary.map((item) => (
            <NavigationLink item={item} key={item.href} pathname={pathname} />
          ))}
          <li>
            <details className="mobile-more">
              <summary>More</summary>
              <ul>
                {visibleSecondary.map((item) => (
                  <NavigationLink
                    item={item}
                    key={item.href}
                    pathname={pathname}
                  />
                ))}
              </ul>
            </details>
          </li>
        </ul>
      </nav>
    </>
  );
}

function NavigationLink({
  item,
  pathname,
}: Readonly<{
  item: { readonly href: string; readonly label: string };
  pathname: string;
}>) {
  const current =
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  return (
    <li>
      <Link aria-current={current ? "page" : undefined} href={item.href}>
        {item.label}
      </Link>
    </li>
  );
}
