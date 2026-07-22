"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const primary = [
  { href: "/", label: "Feed" },
  { href: "/search", label: "Search" },
  { href: "/library/favorites", label: "Favorites" },
  { href: "/sources", label: "Sources" },
] as const;

const secondary = [
  { href: "/library/hidden", label: "Hidden" },
  { href: "/library/history", label: "History" },
  { href: "/duplicates", label: "Duplicates" },
  { href: "/settings", label: "Settings" },
  { href: "/status", label: "Status" },
  { href: "/account/security", label: "Security" },
] as const;

const all = [...primary, ...secondary] as const;

export function PrimaryNavigation() {
  const pathname = usePathname();
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
          {primary.map((item) => (
            <NavigationLink item={item} key={item.href} pathname={pathname} />
          ))}
          <li>
            <details className="mobile-more">
              <summary>More</summary>
              <ul>
                {secondary.map((item) => (
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
