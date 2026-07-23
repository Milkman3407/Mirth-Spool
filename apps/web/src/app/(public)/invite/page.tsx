import type { Metadata } from "next";

import { InvitationAcceptanceForm } from "../../../components/invitation-acceptance-form";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function InvitePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly token?: string | string[] }>;
}) {
  const rawToken = (await searchParams).token;
  const token = typeof rawToken === "string" ? rawToken : "";
  return (
    <section className="auth-card">
      <p className="eyebrow">Invitation only</p>
      <h1>Create your member account</h1>
      <p>
        Use the email address that received this private, single-use invitation.
      </p>
      {token ? (
        <InvitationAcceptanceForm token={token} />
      ) : (
        <p className="form-error" role="alert">
          This invitation link is incomplete.
        </p>
      )}
    </section>
  );
}
