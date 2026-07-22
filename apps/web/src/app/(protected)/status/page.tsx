import type { Metadata } from "next";

export const metadata: Metadata = { title: "Status" };

export default function StatusPlaceholderPage() {
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
