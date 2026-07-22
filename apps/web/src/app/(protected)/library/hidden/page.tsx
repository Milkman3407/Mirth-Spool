import type { Metadata } from "next";

import { LibraryPage } from "../../../../components/library-page";

export const metadata: Metadata = { title: "Hidden items" };
export const dynamic = "force-dynamic";

export default function HiddenPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<
    Readonly<Record<string, string | readonly string[] | undefined>>
  >;
}>) {
  return <LibraryPage kind="hidden" searchParams={searchParams} />;
}
