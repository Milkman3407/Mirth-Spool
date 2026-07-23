import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthenticatedSession } from "../../../lib/auth/session";

export const metadata: Metadata = { title: "Status" };

export default async function StatusPlaceholderPage() {
  const authentication = await getAuthenticatedSession(await headers());
  if (!authentication || authentication.user.role !== "ADMIN") redirect("/");
  return (
    <>
      <p className="eyebrow">Process topology</p>
      <h1>Status</h1>
      <section className="panel" aria-labelledby="health-endpoints-title">
        <h2 id="health-endpoints-title">Public health endpoints</h2>
        <ul className="status-list">
          <li>
            <span>Process liveness</span>
            <code>/api/health/live</code>
          </li>
          <li>
            <span>Dependency readiness</span>
            <code>/api/health/ready</code>
          </li>
        </ul>
        <p>Detailed operational information remains authenticated.</p>
      </section>
    </>
  );
}
