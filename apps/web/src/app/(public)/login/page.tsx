import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthForm } from "../../../components/auth-form";
import { getAuthenticatedSession } from "../../../lib/auth/session";
import { getAuthServices } from "../../../lib/auth/server";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getAuthenticatedSession(await headers())) redirect("/");
  if ((await getAuthServices().database.user.count({ take: 1 })) === 0)
    redirect("/setup");
  return (
    <section className="auth-card">
      <p className="eyebrow">Private instance</p>
      <h1>Sign in.</h1>
      <p className="lede">
        Use the credentials configured by your instance administrator.
      </p>
      <AuthForm mode="login" />
    </section>
  );
}
