import type { Metadata } from "next";

import { LibraryPage } from "../../../../components/library-page";

export const metadata: Metadata = { title: "Favorites" };
export const dynamic = "force-dynamic";

export default function FavoritesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<
    Readonly<Record<string, string | readonly string[] | undefined>>
  >;
}>) {
  return <LibraryPage kind="favorites" searchParams={searchParams} />;
}
