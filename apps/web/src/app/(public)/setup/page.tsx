import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthForm } from "../../../components/auth-form";
import { getAuthenticatedSession } from "../../../lib/auth/session";
import { getAuthServices } from "../../../lib/auth/server";

export const metadata: Metadata = { title: "Initial setup" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await getAuthServices().database.user.count({ take: 1 }))
    redirect("/login");
  if (await getAuthenticatedSession(await headers())) redirect("/");
  return (
    <section className="auth-card">
      <p className="eyebrow">One-time setup</p>
      <h1>Create the administrator.</h1>
      <p className="lede">
        This form closes permanently after the first account is created.
      </p>
      <AuthForm mode="setup" />
    </section>
  );
}
