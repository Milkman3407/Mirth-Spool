import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPlaceholderPage() {
  return (
    <>
      <p className="eyebrow">Administration placeholder</p>
      <h1>Settings</h1>
      <section className="panel">
        <h2>Authentication baseline only</h2>
        <p>
          Product settings remain unavailable until their validated storage and
          APIs exist.
        </p>
      </section>
    </>
  );
}
