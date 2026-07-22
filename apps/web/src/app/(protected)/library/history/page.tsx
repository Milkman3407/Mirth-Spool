import type { Metadata } from "next";

import { LibraryPage } from "../../../../components/library-page";

export const metadata: Metadata = { title: "View history" };
export const dynamic = "force-dynamic";

export default function HistoryPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<
    Readonly<Record<string, string | readonly string[] | undefined>>
  >;
}>) {
  return <LibraryPage kind="history" searchParams={searchParams} />;
}
