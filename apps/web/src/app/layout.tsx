import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { PwaLifecycle } from "../components/pwa-lifecycle";

import "./globals.css";

export const metadata: Metadata = {
  description: "Private, self-hosted meme feed aggregation.",
  manifest: "/manifest.webmanifest",
  title: {
    default: "MirthSpool",
    template: "%s · MirthSpool",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0c1015",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  await connection();

  return (
    <html lang="en">
      <body>
        {children}
        <PwaLifecycle />
      </body>
    </html>
  );
}
